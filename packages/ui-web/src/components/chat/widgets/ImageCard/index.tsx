import { memo } from "react";
import type { ImageWidget } from "@kotys/contracts";

function ImageCardBase({ widget }: IProps) {
  return (
    <div className="my-2 flex max-w-md flex-wrap gap-2">
      {widget.images.map((src, i) => (
        <img
          key={i}
          src={`data:image/jpeg;base64,${src}`}
          alt={`Screenshot ${i + 1}`}
          className="rounded-lg border border-border max-h-48 w-auto"
        />
      ))}
    </div>
  );
}

interface IProps {
  widget: ImageWidget;
}

const ImageCard = memo(ImageCardBase);
export default ImageCard;
