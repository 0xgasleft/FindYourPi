import { ImageResponse } from "next/og";
import { fetchDiscovery } from "@/lib/api";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { id: string } }) {
  const discovery = await fetchDiscovery(params.id);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 30%, #1c1830 0%, #05040a 70%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: "#f2c94c", textTransform: "uppercase", fontWeight: 700 }}>
          I found my place in π
        </div>
        <div style={{ fontSize: 120, fontWeight: 800, marginTop: 24, fontFamily: "monospace" }}>
          {discovery?.sequence ?? "π"}
        </div>
        {discovery && (
          <div style={{ display: "flex", gap: 32, marginTop: 24, fontSize: 28, color: "#a3a3a3" }}>
            <div>Position {discovery.position.toLocaleString()}</div>
            <div>{discovery.match_length} digit match</div>
            <div style={{ color: "#f2c94c" }}>{discovery.rarity_tier}</div>
          </div>
        )}
        <div style={{ marginTop: 40, fontSize: 24, color: "#737373" }}>Find yours at Pi Hunter</div>
      </div>
    ),
    { ...size }
  );
}
