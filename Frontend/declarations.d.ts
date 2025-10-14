declare module '*.svg' {
  import * as React from 'react';
    import { SvgProps } from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}

declare module 'react-native-pdf-lib' {
  export interface PDFPageOptions {
    x?: number;
    y?: number;
    color?: {
      r: number;
      g: number;
      b: number;
    };
    fontSize?: number;
  }

  export class PDFPage {
    static create(): PDFPage;
    setMediaBox(width: number, height: number): PDFPage;
    drawText(text: string, options?: PDFPageOptions): PDFPage;
  }

  export class PDFDocument {
    static create(path: string): PDFDocument;
    addPages(...pages: PDFPage[]): PDFDocument;
    write(): Promise<string>;
  }

  export function rgb(r: number, g: number, b: number): {
    r: number;
    g: number;
    b: number;
  };
}

declare module 'react-native-pdf' {
  import { Component } from 'react';
  import { ViewStyle } from 'react-native';

  export interface PdfProps {
    source: { uri: string } | { path: string };
    style?: ViewStyle;
    onLoadComplete?: (numberOfPages: number, filePath: string) => void;
    onPageChanged?: (page: number, numberOfPages: number) => void;
    onScaleChanged?: (scale: number) => void;
    spacing?: number;
    enablePaging?: boolean;
    horizontal?: boolean;
  }

  export default class Pdf extends Component<PdfProps> {}
}

declare module 'pdf-lib' {
  export interface RGB {
    r: number;
    g: number;
    b: number;
  }

  export interface PDFPageDrawTextOptions {
    x?: number;
    y?: number;
    size?: number;
    font?: PDFFont;
    color?: RGB;
    opacity?: number;
  }

  export interface PDFPageDrawRectangleOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color?: RGB;
    opacity?: number;
    borderColor?: RGB;
    borderWidth?: number;
  }

  export interface PDFPageDrawCircleOptions {
    x?: number;
    y?: number;
    size?: number;
    color?: RGB;
    opacity?: number;
    borderColor?: RGB;
    borderWidth?: number;
  }

  export interface PDFDocumentOptions {
    parseSpeed?: number;
  }

  export class PDFFont {
    static TimesRoman: PDFFont;
    static Helvetica: PDFFont;
    static Courier: PDFFont;
  }

  export class PDFPage {
    getWidth(): number;
    getHeight(): number;
    getSize(): { width: number; height: number };
    drawText(text: string, options?: PDFPageDrawTextOptions): void;
    drawRectangle(options?: PDFPageDrawRectangleOptions): void;
    drawCircle(options?: PDFPageDrawCircleOptions): void;
    drawLine(options: { start: { x: number; y: number }; end: { x: number; y: number }; thickness?: number; color?: RGB; opacity?: number }): void;
  }

  export class PDFDocument {
    static load(data: Uint8Array | ArrayBuffer, options?: PDFDocumentOptions): Promise<PDFDocument>;
    static create(): Promise<PDFDocument>;
    getPages(): PDFPage[];
    getPage(index: number): PDFPage;
    embedFont(font: PDFFont): Promise<PDFFont>;
    save(): Promise<Uint8Array>;
  }

  export function rgb(r: number, g: number, b: number): RGB;
}

declare module 'react-native-fs' {
  export function readFile(filepath: string, encoding?: string): Promise<string>;
  export function writeFile(filepath: string, contents: string | Uint8Array, encoding?: string): Promise<void>;
  export function exists(filepath: string): Promise<boolean>;
  export function copyFile(filepath: string, destPath: string): Promise<void>;
  export const DocumentDirectoryPath: string;

    export function downloadFile(arg0: { fromUrl: string; toFile: string; progressDivider: number; begin: (res: any) => void; progress: (res: any) => void; }) {
        throw new Error("Function not implemented.");
    }
}