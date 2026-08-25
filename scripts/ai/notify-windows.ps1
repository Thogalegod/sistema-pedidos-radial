<#
  Notificacao nativa do Windows (toast) para o Claude Code do projeto Radial.

  Chamado pelos hooks do .claude/settings.json:
    - Stop          -> -Kind stop       (tarefa concluida, aguardando o usuario)
    - Notification  -> -Kind permission (matcher permission_prompt)
    - StopFailure   -> -Kind failure    (turno encerrado por erro de API)

  Seguranca: os textos sao FIXOS e definidos abaixo. O script nao le stdin,
  nao recebe conteudo de tarefa, nao insere caminhos/comandos/segredos na
  notificacao e nao acessa rede. PowerShell 5.1 (WinRT) nativo, sem modulos.

  Uso manual:
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File notify-windows.ps1 -Kind test
    (adicione -DryRun para validar sem exibir o toast)
#>
param(
  [ValidateSet('stop', 'permission', 'failure', 'test')]
  [string]$Kind = 'stop',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$messages = @{
  stop       = 'Tarefa concluida - aguardando voce'
  permission = 'Aprovacao necessaria - o Claude aguarda sua permissao'
  failure    = 'Execucao interrompida por erro (API)'
  test       = 'Notificacao de teste do projeto Radial'
}
$title = 'Claude Code'
$text = $messages[$Kind]

if ($DryRun) {
  Write-Output "NOTIFY_DRYRUN kind=$Kind title=$title text=$text"
  exit 0
}

# Toast WinRT via Windows PowerShell 5.1 (projetoes WinRT nao existem no pwsh 7).
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null

$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = $template.GetElementsByTagName('text')
[void]$texts.Item(0).AppendChild($template.CreateTextNode($title))
[void]$texts.Item(1).AppendChild($template.CreateTextNode($text))

$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
exit 0
