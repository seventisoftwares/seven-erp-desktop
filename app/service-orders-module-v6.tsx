"use client";

import { useEffect, useRef, useState } from "react";
import ServiceOrdersModuleV5 from "./service-orders-module-v5";

const removeAutoPrint = (html: string) => html.replace(/<script>[\s\S]*?<\/script>/gi, "");

export default function ServiceOrdersModuleV6(props: { onClose: () => void; onOpenDesigner: () => void; onOpenCatalog: () => void }) {
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const nativeOpenRef = useRef<typeof window.open | null>(null);

  useEffect(() => {
    const nativeOpen = window.open;
    nativeOpenRef.current = nativeOpen.bind(window);

    (window as any).open = (url?: string | URL, target?: string, features?: string) => {
      const isOsPrintWindow = (url === "" || url == null) && target === "_blank" && typeof features === "string" && features.includes("width=980") && features.includes("height=900");
      if (!isOsPrintWindow) return nativeOpen.call(window, url as any, target, features);

      let captured = "";
      const fakeWindow = {
        document: {
          open: () => undefined,
          write: (chunk: unknown) => { captured += String(chunk ?? ""); },
          close: () => {
            setPreviewHtml(removeAutoPrint(captured));
            setPreviewOpen(true);
          },
        },
      };
      return fakeWindow as unknown as Window;
    };

    return () => {
      window.open = nativeOpen;
      nativeOpenRef.current = null;
    };
  }, []);

  const printPreview = () => {
    if (!previewHtml) return;
    const open = nativeOpenRef.current;
    const win = open?.("", "_blank", "width=980,height=900");
    if (!win) return;
    const printable = previewHtml.replace("</body>", "<script>window.onload=()=>setTimeout(()=>window.print(),120)<\/script></body>");
    win.document.open();
    win.document.write(printable);
    win.document.close();
  };

  return <>
    <ServiceOrdersModuleV5 {...props} />
    {previewOpen && <div className="os-preview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPreviewOpen(false)}>
      <section className="os-preview-dialog" role="dialog" aria-modal="true" aria-label="Pré-visualização da Ordem de Serviço">
        <header className="os-preview-header">
          <div><span>PRÉ-VISUALIZAÇÃO</span><h2>Ordem de Serviço</h2><p>Confira exatamente como o modelo ativo ficará antes de imprimir.</p></div>
          <div className="os-preview-header-actions"><button onClick={props.onOpenDesigner}>Alterar modelo</button><button onClick={() => setPreviewOpen(false)}>Fechar</button><button className="primary" onClick={printPreview}>Imprimir / Salvar PDF</button></div>
        </header>
        <div className="os-preview-toolbar"><span>Modelo atual do Seven OS Studio</span><small>A visualização usa os dados reais da OS e o mesmo layout utilizado na impressão.</small></div>
        <div className="os-preview-stage"><div className="os-preview-paper"><iframe title="Preview da Ordem de Serviço" srcDoc={previewHtml} sandbox="allow-same-origin" /></div></div>
      </section>
    </div>}
  </>;
}
