export interface DateRange {
  start: string;
  end: string;
}

function toInputDateTime(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getDefaultOpsRange(): DateRange {
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  return {
    start: toInputDateTime(start),
    end: toInputDateTime(end),
  };
}
