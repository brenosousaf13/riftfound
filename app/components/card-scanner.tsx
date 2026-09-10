"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, ImagePlus, Loader2, RotateCcw, ScanLine, Trash2, X, Zap } from "lucide-react";

export type ScannedCard = {
  id: string;
  name: string;
  riftbound_id: string;
  rarity: string;
  type: string;
  setLabel: string;
  setId: string;
  imageUrl?: string;
  domains: string[];
  tcgplayer_id?: string;
};

type Candidate = ScannedCard & { confidence: number; matchedBy: "code" | "name" };
type OcrWorker = {
  recognize: (image: HTMLCanvasElement, options?: Record<string, unknown>) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

const ignoredLines = /^(riftbound|legend|champion|unit|gear|spell|battlefield|token|common|uncommon|rare|epic|showcase|signature|action|reaction|passive|while|when|your|enemy|friendly|during|at the|as you|once|draw|ready|exhaust)/i;

const normalizeText = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("en-US")
  .replace(/[^a-z0-9*]+/g, " ")
  .trim();

function extractCardCodes(text: string) {
  const cleaned = text
    .toUpperCase()
    .replace(/\b0GN\b/g, "OGN")
    .replace(/\bOG5\b/g, "OGS")
    .replace(/\b5FD\b/g, "SFD")
    .replace(/\bVEM\b/g, "VEN")
    .replace(/\bUN[1I]\b/g, "UNL")
    .replace(/\b0PP\b/g, "OPP")
    .replace(/[—–_]/g, "-");
  const matches = [...cleaned.matchAll(/\b(OGN|OGS|UNL|SFD|VEN|OPP|JDG|PR)[\s-]*([0-9]{2,3})([A*])?(?:[\s\/-]+([0-9]{2,3}))?\b/g)];
  const exactCodes = matches.map((match) => {
    const set = match[1];
    const number = `${match[2]}${(match[3] ?? "").toLowerCase()}`;
    return `${set}-${number}${match[4] ? `-${match[4]}` : ""}`;
  });
  const noisyPrefixes = [...cleaned.matchAll(/\b([A-Z]{3})[\s-]*([0-9]{3})/g)].map((match) => `${match[1]}-${match[2]}`);
  return [...new Set([...exactCodes, ...noisyPrefixes])].slice(0, 3);
}

function extractNameQueries(text: string) {
  const lines = text.split(/\r?\n/)
    .map((line) => line.replace(/[^A-Za-z0-9'’*: -]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3 && line.length <= 44)
    .filter((line) => /[A-Za-z]{3}/.test(line) && !ignoredLines.test(line));
  return [...new Set(lines)]
    .sort((a, b) => {
      const aWords = a.split(" ").length;
      const bWords = b.split(" ").length;
      return Math.abs(aWords - 2) - Math.abs(bWords - 2) || a.length - b.length;
    })
    .slice(0, 4);
}

function levenshtein(left: string, right: string) {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function similarity(left: string, right: string) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  const editScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const aTokens = a.split(" ").filter((token) => token.length > 2);
  const bTokens = b.split(" ").filter((token) => token.length > 2);
  const overlap = bTokens.filter((token) => aTokens.some((candidate) => candidate.includes(token) || token.includes(candidate))).length;
  const tokenScore = bTokens.length ? overlap / bTokens.length : 0;
  return Math.max(editScore, tokenScore * 0.9 + editScore * 0.1);
}

async function matchOfficialNames(ocrText: string) {
  const detectedLines = extractNameQueries(ocrText);
  if (!detectedLines.length) return [];
  try {
    const response = await fetch("/api/cards/names");
    const payload = await response.json().catch(() => ({}));
    const officialNames = Array.isArray(payload.names) ? payload.names as string[] : [];
    const baseNames = [...new Set(officialNames.map((name) => name.replace(/\s*\([^)]*\)\s*$/, "").trim()))];
    return baseNames
      .map((name) => ({ name, score: Math.max(...detectedLines.map((line) => similarity(line, name))) }))
      .filter((item) => item.score >= 0.34)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.name);
  } catch {
    return detectedLines;
  }
}

function scoreCandidate(card: ScannedCard, ocrTexts: string[], matchedBy: "code" | "name") {
  const normalizedCardCode = normalizeText(card.riftbound_id);
  const codeVotes = ocrTexts.filter((text) => extractCardCodes(text).some((code) => normalizedCardCode.startsWith(normalizeText(code)))).length;
  const haystack = normalizeText(ocrTexts.join("\n"));
  const name = normalizeText(card.name);
  const detectedLines = ocrTexts.flatMap(extractNameQueries);
  const nameSimilarity = detectedLines.length ? Math.max(...detectedLines.map((line) => similarity(line, card.name))) : 0;
  if (codeVotes >= 2) return 100;
  if (codeVotes === 1 && (haystack.includes(name) || nameSimilarity >= 0.58)) return 98;
  if (codeVotes === 1) return 90;
  if (haystack.includes(name)) return 94;
  if (nameSimilarity >= 0.82) return 92;
  const tokens = name.split(" ").filter((token) => token.length > 2);
  const found = tokens.filter((token) => haystack.includes(token)).length;
  const ratio = tokens.length ? found / tokens.length : 0;
  return Math.round((matchedBy === "code" ? 68 : 45) + ratio * 35 + nameSimilarity * 18);
}

async function fetchCandidates(ocrTexts: string[]) {
  const combinedText = ocrTexts.join("\n");
  const codes = ocrTexts.flatMap(extractCardCodes);
  const search = async (searches: Array<{ query: string; matchedBy: "code" | "name" }>) => Promise.all(searches.map(async ({ query, matchedBy }) => {
      const response = await fetch(`/api/cards?query=${encodeURIComponent(query)}&size=10`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return [];
      return (payload.cards ?? []).map((card: ScannedCard) => ({
        ...card,
        matchedBy,
        confidence: scoreCandidate(card, ocrTexts, matchedBy),
      }));
    }));

  const uniqueCodes = [...new Set(codes)];
  const nameQueries = await matchOfficialNames(combinedText);
  const responses = await search([
    ...uniqueCodes.map((query) => ({ query, matchedBy: "code" as const })),
    ...nameQueries.slice(0, uniqueCodes.length ? 2 : 4).map((query) => ({ query, matchedBy: "name" as const })),
  ]);

  const unique = new Map<string, Candidate>();
  for (const candidate of responses.flat()) {
    const current = unique.get(candidate.id);
    if (!current || candidate.confidence > current.confidence) unique.set(candidate.id, candidate);
  }
  return [...unique.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

function drawCardCrop(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, canvas: HTMLCanvasElement) {
  const cardAspect = 5 / 7;
  const maxWidth = sourceWidth * 0.88;
  const maxHeight = sourceHeight * 0.84;
  let cropWidth = Math.min(maxWidth, maxHeight * cardAspect);
  let cropHeight = cropWidth / cardAspect;
  if (cropHeight > maxHeight) {
    cropHeight = maxHeight;
    cropWidth = cropHeight * cardAspect;
  }
  const sx = (sourceWidth - cropWidth) / 2;
  const sy = (sourceHeight - cropHeight) / 2;
  canvas.width = 900;
  canvas.height = 1260;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Não foi possível preparar a imagem.");
  context.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
}

function createCodeCanvas(source: HTMLCanvasElement, threshold?: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * 1.25);
  canvas.height = Math.round(source.height * 0.28 * 1.25);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return source;
  context.drawImage(source, 0, Math.round(source.height * 0.72), source.width, Math.round(source.height * 0.28), 0, 0, canvas.width, canvas.height);
  if (threshold === undefined) return canvas;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const grey = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
    const contrasted = grey > threshold ? 255 : 0;
    pixels.data[index] = contrasted;
    pixels.data[index + 1] = contrasted;
    pixels.data[index + 2] = contrasted;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

type PendingScan = { scanId: number; card: Candidate; alternatives: Candidate[] };

export default function CardScanner({ onCardFound, selectedCount }: { onCardFound: (card: ScannedCard) => void; selectedCount: number }) {
  const [open, setOpen] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState<"idle" | "reading" | "results" | "identified" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pendingScans, setPendingScans] = useState<PendingScan[]>([]);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<OcrWorker | null>(null);
  const operationRef = useRef(0);
  const recognizingRef = useRef(false);
  const waitingForChangeRef = useRef(false);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const stableFramesRef = useRef(0);
  const selected = useMemo(() => candidates.find((card) => card.id === selectedId) ?? candidates[0], [candidates, selectedId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCameraError("");
    setCameraReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Este navegador não liberou a câmera. Use o botão Enviar foto.");
      return;
    }
    void navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().then(() => setCameraReady(true));
        }
      })
      .catch(() => setCameraError("Não foi possível acessar a câmera. Confira a permissão ou envie uma foto."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open]);

  useEffect(() => () => { void workerRef.current?.terminate(); }, []);

  const resetCapture = () => {
    operationRef.current += 1;
    recognizingRef.current = false;
    waitingForChangeRef.current = false;
    previousFrameRef.current = null;
    stableFramesRef.current = 0;
    setPreview("");
    setCandidates([]);
    setSelectedId("");
    setStatus("idle");
    setProgress(0);
    setMessage("");
  };

  const close = () => {
    setOpen(false);
    setPendingScans([]);
    resetCapture();
  };

  const start = () => {
    setPendingScans([]);
    setConfirmedCount(0);
    resetCapture();
    setOpen(true);
  };

  const continueAfter = (operation: number, delay = 1200) => {
    window.setTimeout(() => {
      if (operation !== operationRef.current || !open) return;
      setPreview("");
      setCandidates([]);
      setSelectedId("");
      setProgress(0);
      setStatus("idle");
    }, delay);
  };

  const recognize = async (canvas: HTMLCanvasElement, automatic = autoMode) => {
    if (recognizingRef.current) return;
    recognizingRef.current = true;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setPreview(canvas.toDataURL("image/jpeg", 0.9));
    setStatus("reading");
    setProgress(0.03);
    setMessage("Preparando o reconhecimento...");
    try {
      if (!workerRef.current) {
        const { createWorker } = await import("tesseract.js");
        workerRef.current = await createWorker("eng", undefined, {
          logger: ({ status: workerStatus, progress: workerProgress }) => {
            if (workerStatus === "recognizing text") setProgress(Math.max(0.08, workerProgress));
          },
        }) as OcrWorker;
      }
      if (operation !== operationRef.current) return;
      const worker = workerRef.current;
      const observations: string[] = [];
      setMessage("Lendo o código da carta...");
      await worker.setParameters({ tessedit_pageseg_mode: "11", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/*" });
      const codeResult = await worker.recognize(createCodeCanvas(canvas));
      if (operation !== operationRef.current) return;
      observations.push(codeResult.data.text);

      setMessage("Conferindo o código em uma segunda leitura...");
      const contrastedCodeResult = await worker.recognize(createCodeCanvas(canvas, 150));
      if (operation !== operationRef.current) return;
      observations.push(contrastedCodeResult.data.text);

      const firstCodes = extractCardCodes(observations[0]);
      const secondCodes = extractCardCodes(observations[1]);
      const codeConfirmed = firstCodes.some((code) => secondCodes.includes(code));
      if (!codeConfirmed) {
        setMessage("Conferindo o nome e a versão da carta...");
        await worker.setParameters({ tessedit_pageseg_mode: "11", tessedit_char_whitelist: "" });
        const fullResult = await worker.recognize(canvas, { rotateAuto: true });
        if (operation !== operationRef.current) return;
        observations.push(fullResult.data.text);
      }
      setMessage("Comparando com o catálogo...");
      const matches = await fetchCandidates(observations);
      if (operation !== operationRef.current) return;
      if (!matches.length) {
        setStatus("error");
        setMessage("Não consegui identificar esta carta. Aproxime, evite reflexos e tente novamente.");
        if (automatic) {
          waitingForChangeRef.current = true;
          continueAfter(operation);
        }
        return;
      }
      if (automatic) {
        const card = matches[0];
        const scanId = Date.now() + Math.random();
        setPendingScans((current) => [{ scanId, card, alternatives: matches }, ...current]);
        setCandidates(matches);
        setSelectedId(card.id);
        setProgress(1);
        setStatus("identified");
        setMessage(`${card.name} identificada. Confirme no cartão abaixo.`);
        waitingForChangeRef.current = true;
        previousFrameRef.current = null;
        stableFramesRef.current = 0;
        continueAfter(operation, 700);
        return;
      }
      setCandidates(matches);
      setSelectedId(matches[0].id);
      setProgress(1);
      setStatus("results");
      setMessage(matches[0].matchedBy === "code" ? "Código encontrado. Confirme a versão da carta." : "Encontrei possíveis correspondências. Confirme a carta.");
    } catch {
      if (operation !== operationRef.current) return;
      setStatus("error");
      setMessage("A leitura falhou. Tente outra foto com a carta inteira e mais iluminação.");
      if (automatic) {
        waitingForChangeRef.current = true;
        continueAfter(operation);
      }
    } finally {
      recognizingRef.current = false;
    }
  };

  const capture = (automatic = autoMode) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
    try {
      drawCardCrop(video, video.videoWidth, video.videoHeight, canvas);
      void recognize(canvas, automatic);
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  };

  useEffect(() => {
    if (!open || !cameraReady || !autoMode || status !== "idle") return;
    const video = videoRef.current;
    const analysisCanvas = analysisCanvasRef.current;
    if (!video || !analysisCanvas) return;
    analysisCanvas.width = 40;
    analysisCanvas.height = 56;
    const context = analysisCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const interval = window.setInterval(() => {
      if (recognizingRef.current || !video.videoWidth || !video.videoHeight) return;
      const cardAspect = 5 / 7;
      let cropWidth = video.videoWidth * 0.72;
      let cropHeight = cropWidth / cardAspect;
      if (cropHeight > video.videoHeight * 0.82) {
        cropHeight = video.videoHeight * 0.82;
        cropWidth = cropHeight * cardAspect;
      }
      const sx = (video.videoWidth - cropWidth) / 2;
      const sy = (video.videoHeight - cropHeight) / 2;
      context.drawImage(video, sx, sy, cropWidth, cropHeight, 0, 0, analysisCanvas.width, analysisCanvas.height);
      const pixels = context.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
      const greys = new Uint8ClampedArray(pixels.length / 4);
      let sum = 0;
      for (let source = 0, target = 0; source < pixels.length; source += 4, target += 1) {
        const grey = Math.round(pixels[source] * 0.299 + pixels[source + 1] * 0.587 + pixels[source + 2] * 0.114);
        greys[target] = grey;
        sum += grey;
      }
      const brightness = sum / greys.length;
      let variance = 0;
      for (const grey of greys) variance += (grey - brightness) ** 2;
      const contrast = Math.sqrt(variance / greys.length);
      const previous = previousFrameRef.current;
      previousFrameRef.current = greys;
      if (!previous) return;
      let difference = 0;
      for (let index = 0; index < greys.length; index += 1) difference += Math.abs(greys[index] - previous[index]);
      difference /= greys.length;

      if (waitingForChangeRef.current) {
        if (difference > 12) {
          waitingForChangeRef.current = false;
          stableFramesRef.current = 0;
          setMessage("Nova carta detectada. Mantenha o celular firme...");
        }
        return;
      }

      const usableFrame = brightness > 28 && brightness < 235 && contrast > 24;
      stableFramesRef.current = usableFrame && difference < 7.5 ? stableFramesRef.current + 1 : 0;
      if (stableFramesRef.current >= 4) {
        stableFramesRef.current = 0;
        capture(true);
      } else if (usableFrame) {
        setMessage(stableFramesRef.current >= 2 ? "Carta detectada. Fique imóvel..." : "Leitura automática ativa");
      }
    }, 320);

    return () => window.clearInterval(interval);
  }, [autoMode, cameraReady, open, status]);

  const loadPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canvasRef.current) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        drawCardCrop(image, image.naturalWidth, image.naturalHeight, canvasRef.current!);
        void recognize(canvasRef.current!, autoMode);
      } catch (error) {
        setStatus("error");
        setMessage((error as Error).message);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus("error");
      setMessage("Não foi possível abrir esta imagem.");
    };
    image.src = url;
  };

  const confirm = () => {
    if (!selected) return;
    onCardFound(selected);
    setConfirmedCount((current) => current + 1);
    const name = selected.name;
    resetCapture();
    setMessage(`${name} adicionada. Posicione a próxima carta.`);
  };

  const confirmPending = (scanId: number) => {
    const pending = pendingScans.find((scan) => scan.scanId === scanId);
    if (!pending) return;
    onCardFound(pending.card);
    setConfirmedCount((current) => current + 1);
    setPendingScans((current) => current.filter((scan) => scan.scanId !== scanId));
  };

  const discardPending = (scanId: number) => {
    setPendingScans((current) => current.filter((scan) => scan.scanId !== scanId));
  };

  const changePendingResult = (scanId: number, cardId: string) => {
    setPendingScans((current) => current.map((scan) => {
      if (scan.scanId !== scanId) return scan;
      const replacement = scan.alternatives.find((card) => card.id === cardId);
      return replacement ? { ...scan, card: replacement } : scan;
    }));
  };

  return <>
    <button className="scanner-entry" type="button" onClick={start}>
      <span className="scanner-entry-icon"><ScanLine size={24} /></span>
      <span><b>Escanear cartas</b><small>Use a câmera e adicione várias em sequência</small></span>
      <span className="scanner-entry-count">{selectedCount} na lista</span>
    </button>

    {open && <div className="scanner-backdrop" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
      <div className="scanner-modal">
        <header className="scanner-header">
          <div><span>CADASTRO RÁPIDO</span><h2 id="scanner-title">Escanear cartas</h2></div>
          <div className="scanner-session-status"><b>{confirmedCount}</b><small>confirmada(s) nesta sessão</small></div>
          <div className="scanner-header-actions">
            <button className="scanner-finish" type="button" onClick={close}><Check size={17} /> Finalizar</button>
            <button className="scanner-close" type="button" onClick={close} aria-label="Fechar scanner"><X size={21} /></button>
          </div>
        </header>

        <div className="scanner-body">
          <div className="scanner-camera">
            <video ref={videoRef} className={preview ? "is-hidden" : ""} playsInline muted aria-label="Visualização da câmera" />
            {preview && <img src={preview} alt="Carta capturada" />}
            {!preview && <div className={`scanner-guide ${autoMode ? "is-auto" : ""}`} aria-hidden="true"><i /><span>{autoMode ? (message || "Centralize a carta e mantenha o celular firme") : "Mantenha a carta dentro da moldura"}</span></div>}
            {!preview && !cameraReady && !cameraError && <div className="scanner-camera-state"><Loader2 className="spin" size={24} /> Abrindo câmera...</div>}
            {!preview && cameraError && <div className="scanner-camera-state error"><AlertTriangle size={24} /> {cameraError}</div>}
            {status === "reading" && <div className="scanner-reading"><Loader2 className="spin" size={30} /><b>{message}</b><div><span style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }} /></div><small>Estou conferindo código, nome e versão.</small></div>}
            {status === "identified" && <div className="scanner-scan-flash"><Check size={17} /> Resultado pronto para confirmar</div>}

            <div className="scanner-overlay-toolbar">
              <div className="scanner-mode">
                <div><Zap size={17} /><span><b>Leitura automática</b><small>{autoMode ? "Ativa" : "Pausada"}</small></span></div>
                <button type="button" role="switch" aria-label="Ativar leitura automática" aria-checked={autoMode} className={autoMode ? "is-on" : ""} onClick={() => { resetCapture(); setAutoMode((current) => !current); }}><i /></button>
              </div>
              <div className="scanner-actions">
                {!preview && <button className="primary-button" type="button" onClick={() => capture(autoMode)} disabled={!cameraReady}><Camera size={17} /> Ler agora</button>}
                <button className="scanner-upload" type="button" onClick={() => fileInputRef.current?.click()} disabled={status === "reading"}><ImagePlus size={17} /> Foto</button>
                {preview && status !== "reading" && <button className="scanner-upload" type="button" onClick={resetCapture}><RotateCcw size={15} /> Repetir</button>}
                <input ref={fileInputRef} className="scanner-file-input" type="file" accept="image/*" capture="environment" onChange={loadPhoto} />
              </div>
            </div>

            {status === "error" && <div className="scanner-feedback error"><AlertTriangle size={17} /><span>{message}</span><button type="button" onClick={resetCapture}>Tentar novamente</button></div>}

            {status === "results" && <div className="scanner-results scanner-results-overlay">
              <div className="scanner-results-heading"><div><b>Confirme a carta</b><small>{message}</small></div><span>{candidates.length} resultado(s)</span></div>
              <div className="scanner-candidates">
                {candidates.map((card) => <button type="button" key={card.id} className={card.id === selected?.id ? "selected" : ""} onClick={() => setSelectedId(card.id)}>
                  <span className="scanner-card-image">{card.imageUrl ? <img src={card.imageUrl} alt={card.name} /> : <ScanLine size={20} />}</span>
                  <span className="scanner-card-copy"><b>{card.name}</b><small>{card.riftbound_id} · {card.setLabel} · {card.rarity}</small></span>
                  <span className="scanner-confidence">{card.confidence >= 95 ? "Alta precisão" : "Confira"}</span>
                </button>)}
              </div>
              <button className="primary-button full scanner-confirm" type="button" onClick={confirm}><Check size={17} /> Confirmar {selected?.name}</button>
            </div>}

            {pendingScans.length > 0 && <div className="scanner-pending-rail" aria-live="polite">
              {pendingScans.map((scan) => <article className="scanner-pending-card" key={scan.scanId}>
                <span className="scanner-pending-image">{scan.card.imageUrl ? <img src={scan.card.imageUrl} alt="" /> : <ScanLine size={22} />}</span>
                <div className="scanner-pending-copy">
                  <em>CONFIRA O SCAN</em>
                  <b>{scan.card.name}</b>
                  <small>{scan.card.riftbound_id} · {scan.card.setLabel}</small>
                  {scan.alternatives.length > 1 && <select aria-label="Corrigir resultado da leitura" value={scan.card.id} onChange={(event) => changePendingResult(scan.scanId, event.target.value)}>
                    {scan.alternatives.map((alternative) => <option value={alternative.id} key={alternative.id}>{alternative.name} · {alternative.riftbound_id}</option>)}
                  </select>}
                </div>
                <div className="scanner-pending-actions">
                  <button className="scanner-accept" type="button" onClick={() => confirmPending(scan.scanId)}><Check size={16} /> Confirmar</button>
                  <button className="scanner-reject" type="button" onClick={() => discardPending(scan.scanId)} aria-label={`Descartar ${scan.card.name}`}><Trash2 size={16} /> Descartar</button>
                </div>
              </article>)}
            </div>}
          </div>
        </div>
        <canvas ref={canvasRef} className="scanner-canvas" />
        <canvas ref={analysisCanvasRef} className="scanner-canvas" />
      </div>
    </div>}
  </>;
}
