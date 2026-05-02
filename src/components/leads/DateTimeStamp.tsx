import { useEffect, useState } from "react";

const fmt = (d: Date) => {
  const day = d.toLocaleString("en-US", { weekday: "short" });
  const date = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  const time = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} ${date} ${month} · ${time}`;
};

export const DateTimeStamp = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span
      className="text-[10px] tabular leading-none"
      style={{ color: "hsl(var(--brand-navy) / 0.5)" }}
    >
      {fmt(now)}
    </span>
  );
};
