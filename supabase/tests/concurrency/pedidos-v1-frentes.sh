#!/bin/sh
# Local-only two-session proof. Never accepts a database URL or remote target.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)
db=supabase_db_radial-pedidos-v1-gate05
docker inspect --format '{{.Name}}' "$db" | grep -qx "/$db"
for attempt in $(seq 1 30); do
  docker exec "$db" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$db" pg_isready -U postgres >/dev/null
sql() { docker exec "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "$1"; }
test "$(sql "SELECT count(*) FROM auth.users WHERE id IN ('05000000-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000002','05000000-0000-4000-8000-000000000003')")" = 0
test "$(sql "SELECT count(*) FROM public.organizations WHERE id IN ('05000001-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000002')")" = 0
tmp=$(mktemp -d)
a_pid= b_pid=
cleanup() {
  if [ -n "$a_pid" ]; then wait "$a_pid" || true; fi
  if [ -n "$b_pid" ]; then wait "$b_pid" || true; fi
  sql "BEGIN; DELETE FROM public.anexos WHERE organization_id IN ('05000001-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000002'); DELETE FROM public.organizations WHERE id IN ('05000001-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000002'); DELETE FROM auth.users WHERE id IN ('05000000-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000002','05000000-0000-4000-8000-000000000003'); COMMIT;" >/dev/null
  rm -f "$tmp/a.log" "$tmp/b.log"
  rmdir "$tmp"
}
trap cleanup EXIT
{ printf 'BEGIN;\n'; cat "$root/supabase/tests/helpers/pedidos-v1-fixtures.sql"; printf '\nCOMMIT;\n'; } |
  docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q >/dev/null

auth="SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);"
insert="INSERT INTO public.tarefas(organization_id,pedido_id,descricao) VALUES ('05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000002',"
sql "BEGIN; SET LOCAL application_name='gate1a1-a'; $auth $insert 'Race A'); SELECT pg_sleep(4); COMMIT;" >"$tmp/a.log" 2>&1 &
a_pid=$!
# Observe A inside its transaction after INSERT, before starting B.
ready=false
for attempt in $(seq 1 30); do
  if [ "$(sql "SELECT count(*) FROM pg_stat_activity WHERE application_name='gate1a1-a' AND wait_event='PgSleep'")" = 1 ]; then ready=true; break; fi
  sleep 0.1
done
test "$ready" = true
sql "BEGIN; SET LOCAL application_name='gate1a1-b'; $auth $insert 'Race B'); COMMIT;" >"$tmp/b.log" 2>&1 &
b_pid=$!
blocked=false
for attempt in $(seq 1 30); do
  if [ "$(sql "SELECT count(*) FROM pg_stat_activity WHERE application_name='gate1a1-b' AND cardinality(pg_blocking_pids(pid))>0")" = 1 ]; then blocked=true; break; fi
  sleep 0.1
done
wait "$a_pid"; a_pid=
wait "$b_pid"; b_pid=
if [ "$blocked" != true ]; then
  printf 'FAIL: second INSERT did not wait for the order lock; serialization is missing.\n' >&2
  exit 1
fi
test "$(sql "SELECT count(*) FROM public.pedido_frentes WHERE pedido_id='05000002-0000-4000-8000-000000000002' AND is_legacy_default")" = 1
test "$(sql "SELECT count(*)::text||':'||count(DISTINCT frente_id)::text FROM public.tarefas WHERE pedido_id='05000002-0000-4000-8000-000000000002'")" = '2:1'
printf 'PASS: two authenticated sessions; observed blocking; one Geral; two tasks share it.\n'
