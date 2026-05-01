import { MasterListPage } from "@/components/leads/MasterListPage";
import type { EntityKind } from "@/hooks/useMasterData";

export const MasterList = ({ kind }: { kind: EntityKind }) => <MasterListPage kind={kind} />;
export default MasterList;
