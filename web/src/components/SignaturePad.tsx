// SignaturePad.tsx
import React, { useRef, forwardRef, useImperativeHandle } from "react";
import SignatureCanvas from "react-signature-canvas";

export interface SignaturePadRef {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: (type?: string) => string;
}

interface SignaturePadProps {
  onSignatureChange?: (hasSig: boolean) => void;
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  ({ onSignatureChange }, ref) => {
    const sigRef = useRef<SignatureCanvas | null>(null);

    // Expose methods to parent without causing re-renders
    useImperativeHandle(ref, () => ({
      clear: () => {
        sigRef.current?.clear();
        onSignatureChange?.(false);
      },
      isEmpty: () => sigRef.current?.isEmpty() ?? true,
      toDataURL: (type = "image/png") => sigRef.current?.toDataURL(type) ?? ""
    }));

    return (
      <div
        className="sigBox"
        style={{
          touchAction: "none",
          position: "relative",
          WebkitOverflowScrolling: "touch" // Improve iOS scrolling
        }}
      >
        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          backgroundColor="white"
          clearOnResize={false} // CRITICAL: Prevent clearing on resize
          onBegin={() => onSignatureChange?.(true)}
          onEnd={() => onSignatureChange?.(true)}
          canvasProps={{
            style: {
              width: "100%",
              height: "220px",
              borderRadius: "12px",
              touchAction: "none"
            }
          }}
        />
      </div>
    );
  }
);

SignaturePad.displayName = "SignaturePad";

// CRITICAL: Memoize to prevent re-renders
export default React.memo(SignaturePad);
