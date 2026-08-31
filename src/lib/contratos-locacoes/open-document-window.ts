export async function openDocumentInNewTab(
  loadSignedUrl: () => Promise<string>
): Promise<void> {
  const openedWindow = window.open('', '_blank');

  if (!openedWindow) {
    throw new Error('O navegador bloqueou a nova aba. Permita pop-ups para abrir o documento.');
  }

  openedWindow.opener = null;

  try {
    const signedUrl = await loadSignedUrl();
    openedWindow.location.href = signedUrl;
  } catch (error) {
    openedWindow.close();
    throw error;
  }
}
