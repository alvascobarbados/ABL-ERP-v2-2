import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PipelineStoreProvider } from "@/hooks/usePipelineStore";
import { FriendlyModeProvider } from "@/hooks/useFriendlyMode";
import { ExpandedCardsProvider } from "@/hooks/useExpandedCards";
import { MasterDataProvider } from "@/hooks/useMasterData";
import Index from "./pages/Index.tsx";
import Spreadsheet from "./pages/Spreadsheet.tsx";
import MasterList from "./pages/MasterList.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <FriendlyModeProvider>
        <Toaster />
        <Sonner />
        <PipelineStoreProvider>
          <MasterDataProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/spreadsheet" element={<Spreadsheet />} />
                <Route path="/customers" element={<MasterList kind="customer" />} />
                <Route path="/suppliers" element={<MasterList kind="supplier" />} />
                <Route path="/team" element={<MasterList kind="team" />} />
                <Route path="/products" element={<MasterList kind="product" />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </MasterDataProvider>
        </PipelineStoreProvider>
      </FriendlyModeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
