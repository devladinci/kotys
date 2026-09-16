interface IProps {
  images?: string[];
  onImageClick: (src: string) => void;
}

const imageSrc = (src: string): string =>
  src.startsWith("data:") ? src : `data:image/png;base64,${src}`;

export function MessageImages({ images, onImageClick }: IProps) {
  if (!images?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {images.map((src) => {
        const url = imageSrc(src);
        return (
          <button
            key={url}
            onClick={() => onImageClick(url)}
            aria-label="Open image"
            className="max-h-48 max-w-60 rounded-lg border border-border cursor-zoom-in object-contain p-0 bg-transparent"
          >
            <img
              src={url}
              alt="Attached"
              className="max-h-48 max-w-60 rounded-lg object-contain"
            />
          </button>
        );
      })}
    </div>
  );
}
