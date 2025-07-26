"use client";

import { useCallback } from "react";
import Papa from "papaparse";

export interface CSVUploadConfig<T> {
  onParseComplete: (results: Papa.ParseResult<T>) => void;
  onParseError: (error: Error) => void;
  validateCSV?: (data: Papa.ParseResult<T>) => string | null;
}

export interface CSVUploadHandlerProps<T> {
  config: CSVUploadConfig<T>;
  onLoadingChange: (loading: boolean) => void;
}

export function useCSVUploadHandler<T>({ config, onLoadingChange }: CSVUploadHandlerProps<T>) {
  const { onParseComplete, onParseError, validateCSV } = config;

  const handleParseComplete = useCallback(
    (results: Papa.ParseResult<T>) => {
      const error = validateCSV ? validateCSV(results) : null;
      if (error) {
        onLoadingChange(false);
        onParseError(new Error(error));
        return;
      }

      onParseComplete(results);
    },
    [validateCSV, onParseComplete, onParseError, onLoadingChange]
  );

  const handleParseError = useCallback(
    (error: Error) => {
      onLoadingChange(false);
      onParseError(error);
    },
    [onParseError, onLoadingChange]
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file) return;

      onLoadingChange(true);

      // Try multiple encoding approaches
      const tryMultipleEncodings = async () => {
        // First try with array buffer and different encodings
        const arrayBuffer = await file.arrayBuffer();

        // Try Windows-1252 first (most common for CSV with special chars)
        try {
          const decoder1252 = new TextDecoder("windows-1252");
          const text1252 = decoder1252.decode(arrayBuffer);
          const blob1252 = new Blob([text1252], { type: "text/csv;charset=utf-8" });

          Papa.parse<T>(blob1252 as File, {
            header: true,
            skipEmptyLines: true,
            complete: (results: Papa.ParseResult<T>) => {
              handleParseComplete(results);
            },
            error: () => {
              // If Windows-1252 fails, try ISO-8859-1
              tryISO88591();
            },
          });
        } catch {
          tryISO88591();
        }

        function tryISO88591() {
          try {
            const decoderISO = new TextDecoder("iso-8859-1");
            const textISO = decoderISO.decode(arrayBuffer);
            const blobISO = new Blob([textISO], { type: "text/csv;charset=utf-8" });

            Papa.parse<T>(blobISO as File, {
              header: true,
              skipEmptyLines: true,
              complete: (results: Papa.ParseResult<T>) => {
                handleParseComplete(results);
              },
              error: () => {
                // Finally try UTF-8 as fallback
                Papa.parse<T>(file, {
                  header: true,
                  skipEmptyLines: true,
                  complete: (results: Papa.ParseResult<T>) => {
                    handleParseComplete(results);
                  },
                  error: (error) => {
                    handleParseError(error);
                  },
                });
              },
            });
          } catch {
            // Fallback to regular file parsing
            Papa.parse<T>(file, {
              header: true,
              skipEmptyLines: true,
              complete: (results: Papa.ParseResult<T>) => {
                handleParseComplete(results);
              },
              error: (error) => {
                handleParseError(error);
              },
            });
          }
        }
      };

      tryMultipleEncodings();
    },
    [onLoadingChange, handleParseComplete, handleParseError]
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    handleFileInputChange,
    handleDrop,
    handleDragOver,
  };
}

// Default encoding fix function that can be used by both category and payee uploads
export const defaultFixEncoding = (str: string): string => {
  if (!str) return str;

  let fixed = str;

  // Simple character replacements based on what appears in the CSV
  fixed = fixed.replace(/Ž/g, "é"); // Convert Ž to é
  fixed = fixed.replace(/Õ/g, "'"); // Convert Õ to apostrophe

  // Common double-encoded UTF-8 fixes
  fixed = fixed.replace(/Ã©/g, "é");
  fixed = fixed.replace(/Ã¨/g, "è");
  fixed = fixed.replace(/Ã¡/g, "á");
  fixed = fixed.replace(/Ã /g, "à");
  fixed = fixed.replace(/Ã­/g, "í");
  fixed = fixed.replace(/Ã³/g, "ó");
  fixed = fixed.replace(/Ãº/g, "ú");
  fixed = fixed.replace(/Ã±/g, "ñ");
  fixed = fixed.replace(/Ã§/g, "ç");

  // Common symbol fixes
  fixed = fixed.replace(/Â®/g, "®");
  fixed = fixed.replace(/Â©/g, "©");
  fixed = fixed.replace(/â„¢/g, "™");

  // Smart quotes and dashes
  fixed = fixed.replace(/â€™/g, "'");
  fixed = fixed.replace(/â€œ/g, '"');
  fixed = fixed.replace(/â€/g, '"');
  fixed = fixed.replace(/â€"/g, "–");
  fixed = fixed.replace(/â€"/g, "—");

  return fixed.trim();
};