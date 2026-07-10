"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { month: "ENE", compras: 30, ventas: 23 }, { month: "FEB", compras: 34, ventas: 29 },
  { month: "MAR", compras: 29, ventas: 37 }, { month: "ABR", compras: 46, ventas: 35 },
  { month: "MAY", compras: 43, ventas: 48 }, { month: "JUN", compras: 57, ventas: 52 },
  { month: "JUL", compras: 52, ventas: 61 }, { month: "AGO", compras: 64, ventas: 58 },
  { month: "SEP", compras: 68, ventas: 71 }, { month: "OCT", compras: 76, ventas: 69 },
  { month: "NOV", compras: 73, ventas: 80 }, { month: "DIC", compras: 84, ventas: 87 },
];

export function OperationsChart() {
  return (
    <div className="h-[270px] w-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 270 }}>
        <AreaChart data={data} margin={{ top: 12, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="compras" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0b5bbb" stopOpacity={.2} /><stop offset="100%" stopColor="#0b5bbb" stopOpacity={0} /></linearGradient>
            <linearGradient id="ventas" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#62a0e8" stopOpacity={.2} /><stop offset="100%" stopColor="#62a0e8" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke="#edf0ed" vertical={false} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#89918c", fontWeight: 700 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9aa19c" }} />
          <Tooltip contentStyle={{ border: "1px solid #e5e8e5", borderRadius: 12, boxShadow: "0 8px 30px rgba(23,33,27,.08)", fontSize: 12 }} />
          <Area type="monotone" dataKey="compras" stroke="#0b5bbb" strokeWidth={2.5} fill="url(#compras)" />
          <Area type="monotone" dataKey="ventas" stroke="#62a0e8" strokeWidth={2.5} fill="url(#ventas)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
