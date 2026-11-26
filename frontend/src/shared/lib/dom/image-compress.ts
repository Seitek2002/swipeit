// Фото своего желания перед сохранением сжимаем (TECH_SPEC §5): до 720px по
// большей стороне, JPEG с качеством 0.75 — иначе пара снимков с телефона
// забьёт лимит хранилища.
export const MAX_IMAGE_SIDE = 720;
export const IMAGE_QUALITY = 0.75;

const loadImage = (file: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не получилось открыть фото"));
    };
    image.src = url;
  });

export const compressImage = async (file: Blob): Promise<Blob> => {
  const image = await loadImage(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_SIDE / Math.max(image.width, image.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не получилось обработать фото");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Не получилось сжать фото")),
      "image/jpeg",
      IMAGE_QUALITY,
    ),
  );
};
