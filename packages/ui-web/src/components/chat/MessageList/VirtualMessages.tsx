import type { RefObject, UIEvent, WheelEvent } from "react";
import { List, useDynamicRowHeight } from "react-window";
import type { ListImperativeAPI, RowComponentProps } from "react-window";
import { MessageRow, type IRowCallbacks } from "./MessageRow";
import type { Row } from "./rows";

const ROW_ESTIMATE = 200;

interface IProps extends IRowCallbacks {
  rows: Row[];
  onScroll: (e: UIEvent<HTMLElement>) => void;
  onWheel: (e: WheelEvent<HTMLElement>) => void;
  onRowsRendered: () => void;
  listRef: RefObject<ListImperativeAPI | null>;
}

type RowProps = IRowCallbacks & { rows: Row[] };

function VirtualRow({
  index,
  style,
  ariaAttributes,
  rows,
  ...callbacks
}: RowComponentProps<RowProps>) {
  const row = rows[index];
  if (!row) return null;
  return (
    <div style={style} {...ariaAttributes}>
      <MessageRow row={row} {...callbacks} />
    </div>
  );
}

export function VirtualMessages({
  rows,
  onScroll,
  onWheel,
  onRowsRendered,
  listRef,
  ...callbacks
}: IProps) {
  // The cache object, not a wrapper function: a function makes react-window
  // skip measuring, and every row keeps the estimate.
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: ROW_ESTIMATE });

  return (
    <List
      listRef={listRef}
      rowCount={rows.length}
      rowHeight={rowHeight}
      rowComponent={VirtualRow}
      rowProps={{ rows, ...callbacks }}
      onScroll={onScroll}
      onWheel={onWheel}
      onRowsRendered={onRowsRendered}
      className="h-full overflow-y-auto scrollbar-thin"
    />
  );
}
