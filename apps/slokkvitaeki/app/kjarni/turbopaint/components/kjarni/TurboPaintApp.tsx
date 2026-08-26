"use client";

import dynamic from "next/dynamic";

const WhiteboardApp = dynamic(
  () => import("./WhiteboardApp").then((m) => m.WhiteboardApp),
  {
    ssr: false,
    loading: () => <TurboPaintLoading />,
  }
);

export function TurboPaintLoading() {
  return (
    <div className="tp-root dark flex h-full min-h-0 flex-1 items-center justify-center bg-[#0f1117] text-stone-300">
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[#FE653F] text-lg font-bold text-white">
          T
        </div>
        <h1 className="text-xl font-medium tracking-tight">TurboPaint</h1>
        <p className="mt-1 text-sm text-stone-500">Kjarni · Hleð borði…</p>
      </div>
    </div>
  );
}

export function TurboPaintApp() {
  return <WhiteboardApp />;
}
