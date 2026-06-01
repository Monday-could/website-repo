/**
 * Site-wide low-noise backdrop: soft CSS blobs inspired by React Bits-style ambient backgrounds.
 * No WebGL or `ogl` — keeps GPU and bundle weight down.
 */
import "./AmbientBackdrop.css";

export default function AmbientBackdrop() {
  return (
    <div className="rb-ambient" aria-hidden="true">
      <div className="rb-ambient__blob rb-ambient__blob--a" />
      <div className="rb-ambient__blob rb-ambient__blob--b" />
    </div>
  );
}
