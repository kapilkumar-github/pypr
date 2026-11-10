import { createRoot } from "react-dom/client"
import { Options } from "./Options"
import "@/ui/style.css"

document.body.className = "pp-root"
document.body.style.cssText = "margin:0;background:var(--background);color:var(--foreground)"
createRoot(document.getElementById("root")!).render(<Options />)
