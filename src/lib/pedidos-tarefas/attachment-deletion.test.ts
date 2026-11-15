import { describe, expect, it, vi } from 'vitest';
import { deleteOrderWithAttachments } from './attachment-deletion';

describe('deleteOrderWithAttachments', () => {
  it('preserves loaded paths and removes metadata, storage objects, then the order', async () => {
    const calls: string[] = [];
    const storagePaths = [
      'org/order/file-a.pdf',
      'org/order/file-b.jpg',
    ];
    const listStoragePaths = vi.fn(async () => {
      calls.push('paths');
      return storagePaths;
    });
    const deleteAttachmentMetadata = vi.fn(async () => {
      calls.push('metadata');
    });
    const deleteStorageObjects = vi.fn(async () => {
      calls.push('storage');
    });
    const deleteOrder = vi.fn(async () => {
      calls.push('order');
    });

    await deleteOrderWithAttachments({
      listStoragePaths,
      deleteAttachmentMetadata,
      deleteStorageObjects,
      deleteOrder,
    });

    expect(calls).toEqual(['paths', 'metadata', 'storage', 'order']);
    expect(deleteAttachmentMetadata).toHaveBeenCalledWith(storagePaths);
    expect(deleteStorageObjects).toHaveBeenCalledWith(storagePaths);
  });

  it('does not remove storage objects or the order when metadata deletion fails', async () => {
    const deleteStorageObjects = vi.fn();
    const deleteOrder = vi.fn();

    await expect(
      deleteOrderWithAttachments({
        listStoragePaths: vi.fn().mockResolvedValue(['org/order/file.pdf']),
        deleteAttachmentMetadata: vi.fn().mockRejectedValue(new Error('metadata failed')),
        deleteStorageObjects,
        deleteOrder,
      })
    ).rejects.toThrow('metadata failed');

    expect(deleteStorageObjects).not.toHaveBeenCalled();
    expect(deleteOrder).not.toHaveBeenCalled();
  });

  it('reports a possible orphan and does not delete the order when storage cleanup fails', async () => {
    const deleteAttachmentMetadata = vi.fn().mockResolvedValue(undefined);
    const deleteStorageObjects = vi.fn().mockRejectedValue(new Error('storage failed'));
    const deleteOrder = vi.fn();

    await expect(
      deleteOrderWithAttachments({
        listStoragePaths: vi.fn().mockResolvedValue(['org/order/file.pdf']),
        deleteAttachmentMetadata,
        deleteStorageObjects,
        deleteOrder,
      })
    ).rejects.toThrow('Metadados removidos, mas pode ter restado um objeto órfão no Storage');

    expect(deleteAttachmentMetadata).toHaveBeenCalledOnce();
    expect(deleteStorageObjects).toHaveBeenCalledOnce();
    expect(deleteOrder).not.toHaveBeenCalled();
  });

  it('deletes an order without calling attachment operations when there are no files', async () => {
    const deleteAttachmentMetadata = vi.fn();
    const deleteStorageObjects = vi.fn();
    const deleteOrder = vi.fn().mockResolvedValue(undefined);

    await deleteOrderWithAttachments({
      listStoragePaths: vi.fn().mockResolvedValue([]),
      deleteAttachmentMetadata,
      deleteStorageObjects,
      deleteOrder,
    });

    expect(deleteAttachmentMetadata).not.toHaveBeenCalled();
    expect(deleteStorageObjects).not.toHaveBeenCalled();
    expect(deleteOrder).toHaveBeenCalledOnce();
  });

  it('uses paths loaded at deletion time instead of stale UI state', async () => {
    const deleteAttachmentMetadata = vi.fn().mockResolvedValue(undefined);
    const deleteStorageObjects = vi.fn().mockResolvedValue(undefined);

    await deleteOrderWithAttachments({
      listStoragePaths: vi.fn().mockResolvedValue(['org/order/server-only.pdf']),
      deleteAttachmentMetadata,
      deleteStorageObjects,
      deleteOrder: vi.fn().mockResolvedValue(undefined),
    });

    expect(deleteAttachmentMetadata).toHaveBeenCalledWith(['org/order/server-only.pdf']);
    expect(deleteStorageObjects).toHaveBeenCalledWith(['org/order/server-only.pdf']);
  });
});
