import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";

type StoredReference = {
    name: string;
    url: string;
    storageKey?: string;
};

export async function readReferenceBlob(reference: StoredReference, signal?: AbortSignal) {
    if (reference.storageKey) {
        const stored = reference.storageKey.startsWith("image:") ? await getImageBlob(reference.storageKey) : await getMediaBlob(reference.storageKey);
        if (stored) return stored;
    }
    if (reference.url.startsWith("blob:")) throw new Error(`本地参考素材 ${reference.name} 已失效，请重新上传`);
    const response = await fetch(reference.url, { signal });
    if (!response.ok) throw new Error(`参考素材 ${reference.name} 读取失败`);
    return response.blob();
}
