import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthHeaders } from "../services/api";
import { canUseProtectedApi } from "../services/api";
import {
  deleteHistoryItem,
  fetchHistoryList,
  renameHistoryItem,
  saveOrUpdateHistory,
} from "../services/history";
import type { HistoryItem } from "../types";

function historyQueryKey(authHeader: AuthHeaders): string[] {
  const token = authHeader.Authorization ?? authHeader["X-User-Id"] ?? "anonymous";
  return ["history", token];
}

export function useHistoryQuery(authHeader: AuthHeaders, hasUser: boolean) {
  const enabled = canUseProtectedApi(hasUser);

  return useQuery({
    queryKey: historyQueryKey(authHeader),
    queryFn: () => fetchHistoryList(authHeader),
    enabled,
  });
}

type HistoryPayload = Parameters<typeof saveOrUpdateHistory>[2];

export function useHistoryMutations(authHeader: AuthHeaders) {
  const queryClient = useQueryClient();
  const key = historyQueryKey(authHeader);

  const patchLocal = (updater: (items: HistoryItem[]) => HistoryItem[]) => {
    queryClient.setQueryData<HistoryItem[]>(key, (prev) => updater(prev ?? []));
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteHistoryItem(authHeader, id),
    onSuccess: invalidate,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameHistoryItem(authHeader, id, name),
    onSuccess: invalidate,
  });

  const saveHistory = useMutation({
    mutationFn: ({
      currentHistoryId,
      payload,
    }: {
      currentHistoryId: string | null;
      payload: HistoryPayload;
    }) => saveOrUpdateHistory(authHeader, currentHistoryId, payload),
    onSuccess: invalidate,
  });

  return { patchLocal, invalidate, deleteMutation, renameMutation, saveHistory };
}
