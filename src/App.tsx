import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PipelineStoreProvider } from "@/hooks/usePipelineStore";
import { CurrentUserProvider } from "@/hooks/useCurrentUser";
import { FriendlyModeProvider } from "@/hooks/useFriendlyMode";
import { ExpandedCardsProvider } from "@/hooks/useExpandedCards";
import { MasterDataProvider } from "@/hooks/useMasterData";
import { ColumnWidthsProvider } from "@/hooks/useColumnWidths";
import { SidebarCollapsedProvider } from "@/hooks/useSidebarCollapsed";
import Index from "./pages/Index.tsx";
import MasterList from "./pages/MasterList.tsx";
import ArchivePage from "./pages/Archive.tsx";
import TrashPage from "./pages/Trash.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CurrentUserProvider>
      <FriendlyModeProvider>
        <Toaster />
        <Sonner />
        <PipelineStoreProvider>
          <MasterDataProvider>
            <ColumnWidthsProvider>
              <ExpandedCardsProvider>
                <SidebarCollapsedProvider>
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/customers" element={<MasterList kind="customer" />} />
                    <Route path="/suppliers" element={<MasterList kind="supplier" />} />
                    <Route path="/team" element={<MasterList kind="team" />} />
                    <Route path="/archive" element={<ArchivePage />} />
                    <Route path="/trash" element={<TrashPage />} />
                    {/* v1.0: deferred routes redirect to Pipeline */}
                    <Route path="/spreadsheet" element={<Navigate to="/" replace />} />
                    <Route path="/products" element={<Navigate to="/" replace />} />
                    <Route path="/shipments" element={<Navigate to="/" replace />} />
                    <Route path="/shipments/:mode" element={<Navigate to="/" replace />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
                </SidebarCollapsedProvider>
              </ExpandedCardsProvider>
            </ColumnWidthsProvider>
          </MasterDataProvider>
        </PipelineStoreProvider>
      </FriendlyModeProvider>
      </CurrentUserProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
