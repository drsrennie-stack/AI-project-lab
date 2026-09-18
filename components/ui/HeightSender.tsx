"use client";
import { useEffect } from "react";

// Iframe height sender: lets a parent page (Kajabi, Canvas) size the frame to the content.
export function HeightSender() {
  useEffect(() => {
    if (window.parent === window) return;
    const id = "ai-project-lab";
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.documentElement.scrollHeight);
      if (h !== last) {
        last = h;
        window.parent.postMessage({ id, type: "setHeight", height: h }, "*");
      }
    };
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    window.addEventListener("load", send);
    window.addEventListener("resize", send);
    send();
    return () => {
      ro.disconnect();
      window.removeEventListener("load", send);
      window.removeEventListener("resize", send);
    };
  }, []);
  return null;
}
