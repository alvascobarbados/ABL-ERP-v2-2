import { useSearchParams } from "react-router-dom";
import { MasterListPage } from "@/components/leads/MasterListPage";
import { TeamListPage } from "@/components/leads/TeamListPage";
import { TeamMemberPage } from "@/components/leads/TeamMemberPage";
import type { EntityKind } from "@/hooks/useMasterData";

export const MasterList = ({ kind }: { kind: EntityKind }) => {
  const [params] = useSearchParams();
  if (kind === "team") {
    const memberId = params.get("team_member");
    if (memberId) return <TeamMemberPage memberId={memberId} />;
    return <TeamListPage />;
  }
  return <MasterListPage kind={kind} />;
};
export default MasterList;
