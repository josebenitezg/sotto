import { Download } from "lucide-react";
import { Button } from "./ui/button";
import {
  DESKTOP_DOWNLOAD_URL,
  DESKTOP_RELEASE_VERSION,
} from "@/lib/desktop-release";

export function MacDownload() {
  return (
    <div>
      <Button asChild variant="outline" size="lg">
        <a href={DESKTOP_DOWNLOAD_URL}>
          <Download aria-hidden="true" />
          Download for Mac
        </a>
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Local AI · Apple Silicon · Preview {DESKTOP_RELEASE_VERSION}
      </p>
    </div>
  );
}
