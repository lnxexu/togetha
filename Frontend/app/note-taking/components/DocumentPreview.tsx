import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Platform, ActivityIndicator, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Rect, Circle, Path, Text as SvgText } from "react-native-svg";
import { getLocalPDFPath } from "../utils/pdfUtils";

// Lazy require to avoid web bundling issues
const Pdf = Platform.OS !== "web" ? require("react-native-pdf").default : null;

type DocAnnotation = {
  id: string;
  type:
    | "highlight"
    | "note"
    | "underline"
    | "strikethrough"
    | "pen"
    | "brush"
    | "pencil"
    | "text";
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  text?: string;
  path?: string;
  strokeWidth?: number;
  timestamp?: number;
};

interface DocumentPreviewProps {
  uri?: string | null;
  documentUrl?: string | null;
  annotations?: DocAnnotation[] | null;
  width?: number;
  height?: number;
}

const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  uri,
  documentUrl,
  annotations,
  width = 120,
  height = 160,
}) => {
  const [localUri, setLocalUri] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true); // Start loading
      setError(null);
      try {
        const source = uri || documentUrl || undefined;
        if (!source) {
          console.log("DocumentPreview: No source URI provided.");
          setError("No source URI provided.");
          setLoading(false);
          return;
        }
        console.log("DocumentPreview: Source URI:", source);
        
        // For remote URLs, try to get local path first, but fall back gracefully
        if (source.startsWith('http://') || source.startsWith('https://')) {
          try {
            // Ensure we have a local file path for react-native-pdf
            const token = await AsyncStorage.getItem("authToken");
            const authHeaders = token ? { Authorization: `Token ${token}` } : undefined;
            const result = await getLocalPDFPath(source, undefined, authHeaders);
            if (!mounted) return;
            console.log("DocumentPreview: Local URI result:", result);
            if (result) {
              setLocalUri(result);
              return;
            }
          } catch (downloadError: any) {
            console.warn("DocumentPreview: Failed to download PDF locally:", downloadError);
            // For preview purposes, we can try to use the remote URL directly
            // Some PDF viewers can handle remote URLs, though it's less reliable
            if (source.startsWith('https://')) {
              console.log("DocumentPreview: Attempting to use remote URL directly for preview");
              setLocalUri(source);
              return;
            }
            // If it's HTTP or download failed completely, show error
            setError(`Failed to download PDF: ${downloadError.message || 'Network request failed'}`);
            return;
          }
        } else {
          // Local file - use directly
          setLocalUri(source);
        }
      } catch (e: any) {
        console.error("DocumentPreview: Error getting PDF:", e);
        setError(e.message || "Failed to load PDF.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [uri, documentUrl]);

  const scaleNormalizedPath = (
    rawPath: string,
    w: number,
    h: number
  ): string => {
    if (!rawPath) return "";
    let path = rawPath
      .replace(/([ML])\s*[\.,]\s*/g, "$1 ")
      .replace(/\s+/g, " ")
      .trim();

    let out = "";
    let i = 0;
    const len = path.length;

    const readNumber = (): { num: number | null; next: number } => {
      let j = i;
      const numMatch = /^-?\d*\.?\d+/.exec(path.slice(j));
      if (!numMatch) return { num: null, next: j };
      const str = numMatch[0];
      const val = parseFloat(str);
      return { num: Number.isFinite(val) ? val : null, next: j + str.length };
    };

    while (i < len) {
      const ch = path[i];
      if (ch === "M" || ch === "L") {
        // Emit command followed by a single space
        out += ch + " ";
        i++;

        // Skip any separators between command and first number
        while (i < len && /[\s,]/.test(path[i])) i++;

        // x
        let { num: x, next } = readNumber();
        if (x === null) {
          continue;
        }
        i = next;

        // Skip any separators before y
        while (i < len && /[\s,]/.test(path[i])) i++;

        // y
        let { num: y, next: next2 } = readNumber();
        if (y === null) {
          continue;
        }
        i = next2;

        // Optional :pressure (preserve but don't output if present; not used in Path)
        if (path[i] === ":") {
          // consume optional pressure value
          let k = i + 1;
          const presMatch = /^-?\d*\.?\d+/.exec(path.slice(k));
          if (presMatch) {
            i = k + presMatch[0].length;
          }
        }

        // Clamp to [0,1] then scale
        const sx = Math.max(0, Math.min(1, x)) * w;
        const sy = Math.max(0, Math.min(1, y)) * h;
        out += `${sx.toFixed(2)},${sy.toFixed(2)}`;
      } else {
        // Ignore stray commas right after commands or duplicate separators; keep Z/z if present
        if (ch === "," || ch === "\\n" || ch === "\\r") {
          i++;
          continue;
        }
        if (ch === "Z" || ch === "z") {
          out += ch;
        }
        // Convert multiple spaces to single
        if (ch === " ") {
          // ensure single space separation between path segments
          if (out.length && out[out.length - 1] !== " ") out += " ";
          i++;
          continue;
        }
        // For any other char, just advance (avoid echoing invalid tokens)
        i++;
      }
      // Add a single space between segments
      if (out.length && out[out.length - 1] !== " ") out += " ";
    }
    return out.trim();
  };

  const overlay = useMemo(() => {
    const anns = Array.isArray(annotations) ? annotations : [];
    return (
      <Svg
        pointerEvents="none"
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
      >
        {anns
          .filter((a) => a.page === 1)
          .map((a) => {
            const x = (a.x || 0) * width;
            const y = (a.y || 0) * height;
            const w = (a.width || 0) * width;
            const h = (a.height || 0) * height;

            if (
              (a.type === "pen" ||
                a.type === "brush" ||
                a.type === "pencil" ||
                a.type === "text") &&
              a.path
            ) {
              // Convert normalized path (0..1) to scaled pixels using width for x and height for y
              const scaledPath = scaleNormalizedPath(a.path, width, height);
              return (
                <Path
                  key={a.id}
                  d={scaledPath}
                  stroke={a.color || "#FFEB3B"}
                  strokeWidth={(a.strokeWidth || 2) * 0.75}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            }

            if (a.type === "highlight") {
              return (
                <Rect
                  key={a.id}
                  x={x}
                  y={y}
                  width={Math.max(1, w || width * 0.3)}
                  height={Math.max(1, h || height * 0.06)}
                  fill={a.color || "#FFEB3B"}
                  opacity={0.3}
                />
              );
            }

            if (a.type === "note") {
              return (
                <>
                  <Circle
                    key={`${a.id}-c`}
                    cx={x}
                    cy={y}
                    r={8}
                    fill={a.color || "#FFEB3B"}
                  />
                  <SvgText
                    key={`${a.id}-t`}
                    x={x}
                    y={y + 3}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#fff"
                  >
                    N
                  </SvgText>
                </>
              );
            }

            if (a.type === "underline" || a.type === "strikethrough") {
              return (
                <Rect
                  key={a.id}
                  x={x}
                  y={y}
                  width={Math.max(1, w || width * 0.3)}
                  height={2}
                  fill={a.color || "#FFEB3B"}
                />
              );
            }

            return null;
          })}
      </Svg>
    );
  }, [annotations, width, height]);

  if (error) {
    return (
      <View style={[styles.container, { width, height, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', padding: 4 }]}>
        <Text style={{ color: '#B91C1C', fontSize: 10, textAlign: 'center' }}>
          {error.includes('Network request failed') 
            ? 'PDF unavailable offline. Connect to internet to view.' 
            : error}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { width, height }]}>
        <ActivityIndicator size="small" color="#6366F1" />
      </View>
    );
  }

  if (!localUri || !Pdf) {
    // Fallback placeholder (no PDF render available)
    return <View style={[styles.placeholder, { width, height }]} />;
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <Pdf
        source={{ uri: localUri }}
        page={1}
        style={{ width, height, borderRadius: 6 }}
        enablePaging={false}
        scale={1.0}
        spacing={0}
        fitPolicy={2}
        trustAllCerts={false}
        onLoadComplete={(numberOfPages: number, filePath: string) => {
          console.log(`DocumentPreview: PDF loaded successfully. Pages: ${numberOfPages}, Path: ${filePath}`);
        }}
        onError={(pdfError: any) => {
          console.error("DocumentPreview: react-native-pdf error:", pdfError);
          setError(`PDF Error: ${pdfError.message || 'Unknown error'}`);
        }}
      />
      {overlay}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  placeholder: {
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
});

export default DocumentPreview;
