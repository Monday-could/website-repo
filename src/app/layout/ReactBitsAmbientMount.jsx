import AmbientBackdrop from "../../react-bits/AmbientBackdrop.jsx";
import { useReactBits } from "../../react-bits/ReactBitsProvider.jsx";

export function ReactBitsAmbientMount() {
  const rb = useReactBits();
  return rb.ambient ? <AmbientBackdrop /> : null;
}
