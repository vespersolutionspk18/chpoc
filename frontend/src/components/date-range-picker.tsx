"use client";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: DateRangePickerProps) {
  const inputClasses =
    "h-8 rounded-none border-0 border-b border-[#00f0ff]/30 bg-[#030712]/80 glass-deep px-2 font-data text-xs text-[#00f0ff] outline-none transition-colors focus:border-[#00f0ff] [color-scheme:dark]";

  return (
    <div className="flex items-center gap-3">
      <label className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">
        FROM
      </label>
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        className={inputClasses}
      />
      <label className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">
        TO
      </label>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        className={inputClasses}
      />
    </div>
  );
}
