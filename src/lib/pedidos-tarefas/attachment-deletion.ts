interface DeleteOrderWithAttachmentsOptions {
  listStoragePaths: () => Promise<string[]>;
  deleteAttachmentMetadata: (storagePaths: string[]) => Promise<void>;
  deleteStorageObjects: (storagePaths: string[]) => Promise<void>;
  deleteOrder: () => Promise<void>;
}

export const ATTACHMENT_ORPHAN_WARNING =
  'Metadados removidos, mas pode ter restado um objeto órfão no Storage';

export async function deleteOrderWithAttachments({
  listStoragePaths,
  deleteAttachmentMetadata,
  deleteStorageObjects,
  deleteOrder,
}: DeleteOrderWithAttachmentsOptions) {
  const storagePaths = await listStoragePaths();

  if (storagePaths.length > 0) {
    await deleteAttachmentMetadata(storagePaths);
    try {
      await deleteStorageObjects(storagePaths);
    } catch {
      throw new Error(ATTACHMENT_ORPHAN_WARNING);
    }
  }

  await deleteOrder();
}
