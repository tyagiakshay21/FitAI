import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CameraOff, Video } from 'lucide-react';

export interface CameraHandle { captureBlob: () => Promise<Blob | null>; }

/** Requests the webcam and renders it, exposing frame-grabbing to a WebSocket loop or single-shot capture. */
export const CameraCapture = forwardRef<CameraHandle, { landmarks?: [number, number, number][]; active: boolean; onFrame?: (blob: Blob) => void; fps?: number }>(
  ({ landmarks, active, onFrame, fps = 6 }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
      let cancelled = false;
      const constraints = { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false };
      navigator.mediaDevices.getUserMedia(constraints)
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }))
        .then((stream) => {
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => setReady(true);
            videoRef.current.play().catch(() => {});
          }
        })
        .catch((err) => setError(`Camera access unavailable: ${err.message || 'Please grant camera permission in your browser.'}`));
      return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
    }, []);

    useImperativeHandle(ref, () => ({
      captureBlob: () => new Promise((resolve) => {
        const v = videoRef.current, c = canvasRef.current;
        if (!v || !c) return resolve(null);
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d')?.drawImage(v, 0, 0);
        c.toBlob((b) => resolve(b), 'image/jpeg', 0.8);
      }),
    }));

    useEffect(() => {
      if (!active || !ready || !onFrame) return;
      const id = setInterval(async () => {
        const v = videoRef.current, c = canvasRef.current;
        if (!v || !c) return;
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d')?.drawImage(v, 0, 0);
        c.toBlob((b) => b && onFrame(b), 'image/jpeg', 0.6);
      }, 1000 / fps);
      return () => clearInterval(id);
    }, [active, ready, onFrame, fps]);

    // Draw skeleton overlay
    useEffect(() => {
      const overlay = document.getElementById('pose-overlay') as HTMLCanvasElement | null;
      const v = videoRef.current;
      if (!overlay || !v) return;
      overlay.width = v.clientWidth; overlay.height = v.clientHeight;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      if (!landmarks?.length) return;
      const PAIRS: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
      ctx.strokeStyle = '#1F6F5B'; ctx.lineWidth = 3; ctx.fillStyle = '#E9A72C';
      PAIRS.forEach(([a, b]) => {
        const [ax, ay, av] = landmarks[a] ?? [0, 0, 0], [bx, by, bv] = landmarks[b] ?? [0, 0, 0];
        if (av > 0.4 && bv > 0.4) {
          ctx.beginPath(); ctx.moveTo(ax * overlay.width, ay * overlay.height); ctx.lineTo(bx * overlay.width, by * overlay.height); ctx.stroke();
        }
      });
      landmarks.forEach(([x, y, v2]) => { if (v2 > 0.4) { ctx.beginPath(); ctx.arc(x * overlay.width, y * overlay.height, 4, 0, 7); ctx.fill(); } });
    }, [landmarks]);

    if (error) return <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl2 bg-ink text-white"><CameraOff className="h-8 w-8" /><p className="max-w-xs text-center text-sm">{error}</p></div>;

    return (
      <div className="relative aspect-video overflow-hidden rounded-xl2 bg-ink">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        <canvas id="pose-overlay" className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" />
        <canvas ref={canvasRef} className="hidden" />
        {!ready && <div className="absolute inset-0 flex items-center justify-center gap-2 text-white"><Video className="h-5 w-5 animate-pulse" /> Starting camera…</div>}
      </div>
    );
  },
);
CameraCapture.displayName = 'CameraCapture';
