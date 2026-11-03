import toast, { useToaster } from "react-hot-toast";

/**
 * Custom toaster with a close (✕) button on each toast.
 * Drop-in replacement for <Toaster /> — all existing toast.success / toast.error calls work unchanged.
 */
export default function DismissibleToaster() {
  const { toasts, handlers } = useToaster();
  const { startPause, endPause, calculateOffset, updateHeight } = handlers;

  return (
    <div
      style={{ position: "fixed", top: 16, right: 16, zIndex: 9999 }}
      onMouseEnter={startPause}
      onMouseLeave={endPause}
    >
      {toasts
        .filter((t) => t.visible)
        .map((t) => {
          const offset = calculateOffset(t, { reverseOrder: false, gutter: 8 });

          const ref = (el) => {
            if (el && typeof t.height !== "number") {
              const h = el.getBoundingClientRect().height;
              updateHeight(t.id, h);
            }
          };

          /* colours by type */
          let bg = "#fff";
          let border = "#e5e7eb";
          let icon = "ℹ️";
          if (t.type === "success") { bg = "#f0fdf4"; border = "#86efac"; icon = "✅"; }
          if (t.type === "error")   { bg = "#fef2f2"; border = "#fca5a5"; icon = "❌"; }

          return (
            <div
              key={t.id}
              ref={ref}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                transition: "transform 0.23s ease-out, opacity 0.23s ease-out",
                transform: `translateY(${offset}px)`,
                opacity: t.visible ? 1 : 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: 8,
                padding: "10px 14px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                maxWidth: 360,
                minWidth: 220,
                fontSize: 14,
              }}
            >
              <span style={{ flexShrink: 0 }}>{icon}</span>
              <span style={{ flex: 1, wordBreak: "break-word" }}>
                {t.message && typeof t.message === "function"
                  ? t.message(t)
                  : t.message}
              </span>
              <button
                onClick={() => toast.dismiss(t.id)}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  color: "#9ca3af",
                  padding: "0 2px",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
    </div>
  );
}