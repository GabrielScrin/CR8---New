/**
 * useAIAgents - Hook for AI agent management
 * List, create, update, delete AI agents with React Query
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    aiAgentService,
    type CreateAIAgentParams,
    type UpdateAIAgentParams,
} from '@/services/aiAgentService';
import type { AIAgent } from '@/types';

const AI_AGENTS_KEY = ['ai-agents'];

// =============================================================================
// List Hook
// =============================================================================

export function useAIAgents() {
    const query = useQuery<AIAgent[]>({
        queryKey: AI_AGENTS_KEY,
        queryFn: aiAgentService.list,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    // Computed values
    const agents = query.data ?? [];
    const defaultAgent = agents.find((a) => a.is_default) ?? null;
    const activeAgents = agents.filter((a) => a.is_active);

    return {
        agents,
        defaultAgent,
        activeAgents,
        isLoading: query.isLoading,
        isRefetching: query.isRefetching,
        error: query.error as Error | null,
        refetch: query.refetch,
    };
}

// =============================================================================
// Single Agent Hook
// =============================================================================

export function useAIAgent(id: string | null) {
    const query = useQuery<AIAgent>({
        queryKey: [...AI_AGENTS_KEY, id],
        queryFn: () => aiAgentService.get(id!),
        enabled: !!id,
        staleTime: 5 * 60 * 1000,
    });

    return {
        agent: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error as Error | null,
        refetch: query.refetch,
    };
}

// =============================================================================
// Mutations Hook
// =============================================================================

export function useAIAgentMutations() {
    const queryClient = useQueryClient();

    // Create agent
    const createMutation = useMutation({
        mutationFn: (params: CreateAIAgentParams) => aiAgentService.create(params),
        onSuccess: (newAgent) => {
            // Add to cache
            queryClient.setQueryData<AIAgent[]>(AI_AGENTS_KEY, (old) => {
                if (!old) return [newAgent];
                // If new agent is default, update others
                if (newAgent.is_default) {
                    return [newAgent, ...old.map((a) => ({ ...a, is_default: false }))];
                }
                return [newAgent, ...old];
            });
        },
    });

    // Update agent
    const updateMutation = useMutation({
        mutationFn: ({ id, ...params }: { id: string } & UpdateAIAgentParams) =>
            aiAgentService.update(id, params),
        onSuccess: (updated) => {
            // Update in list cache
            queryClient.setQueryData<AIAgent[]>(AI_AGENTS_KEY, (old) => {
                if (!old) return old;
                return old.map((a) => {
                    if (a.id === updated.id) return updated;
                    // If updated agent became default, unset others // Client side logic
                    if (updated.is_default && a.is_default) {
                        return { ...a, is_default: false };
                    }
                    return a;
                });
            });
            // Update single agent cache
            queryClient.setQueryData([...AI_AGENTS_KEY, updated.id], updated);
        },
    });

    // Delete agent
    const deleteMutation = useMutation({
        mutationFn: (id: string) => aiAgentService.delete(id),
        onSuccess: (_, deletedId) => {
            // Remove from cache
            queryClient.setQueryData<AIAgent[]>(AI_AGENTS_KEY, (old) => {
                if (!old) return old;
                return old.filter((a) => a.id !== deletedId);
            });
            // Remove single agent cache
            queryClient.removeQueries({ queryKey: [...AI_AGENTS_KEY, deletedId] });
        },
    });

    // Set as default
    const setDefaultMutation = useMutation({
        mutationFn: (id: string) => aiAgentService.setDefault(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: AI_AGENTS_KEY });
        }
    });

    // Toggle active
    const toggleActiveMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
            aiAgentService.toggleActive(id, isActive),
        onMutate: async ({ id, isActive }) => {
            await queryClient.cancelQueries({ queryKey: AI_AGENTS_KEY });

            // Optimistic update
            queryClient.setQueryData<AIAgent[]>(AI_AGENTS_KEY, (old) => {
                if (!old) return old;
                return old.map((a) =>
                    a.id === id ? { ...a, is_active: isActive } : a
                );
            });
        },
        onError: () => {
            queryClient.invalidateQueries({ queryKey: AI_AGENTS_KEY });
        },
    });

    return {
        create: createMutation.mutateAsync,
        update: updateMutation.mutateAsync,
        delete: deleteMutation.mutateAsync,
        setDefault: setDefaultMutation.mutateAsync,
        toggleActive: toggleActiveMutation.mutateAsync,

        isCreating: createMutation.isPending,
        isUpdating: updateMutation.isPending,
        isDeleting: deleteMutation.isPending,
        isSettingDefault: setDefaultMutation.isPending,
        isTogglingActive: toggleActiveMutation.isPending,

        createError: createMutation.error,
        updateError: updateMutation.error,
        deleteError: deleteMutation.error,
    };
}

// =============================================================================
// Global Toggle Hook (Mocked for now as we don't have separate toggle API)
// =============================================================================

export function useAIAgentsGlobalToggle() {
    // Assuming global toggle is a setting on the company or just always true for now.
    // We can implement this later if needed.
    return {
        enabled: true,
        isLoading: false,
        isUpdating: false,
        error: null,
        toggle: async () => { },
    };
}

// =============================================================================
// Combined Controller Hook
// =============================================================================

export function useAIAgentsController() {
    const { agents, defaultAgent, activeAgents, isLoading, error, refetch } = useAIAgents();
    const mutations = useAIAgentMutations();

    const handleCreate = useCallback(
        async (params: CreateAIAgentParams) => {
            return mutations.create(params);
        },
        [mutations]
    );

    const handleUpdate = useCallback(
        async (id: string, params: UpdateAIAgentParams) => {
            return mutations.update({ id, ...params });
        },
        [mutations]
    );

    const handleDelete = useCallback(
        async (id: string) => {
            return mutations.delete(id);
        },
        [mutations]
    );

    const handleSetDefault = useCallback(
        async (id: string) => {
            return mutations.setDefault(id);
        },
        [mutations]
    );

    const handleToggleActive = useCallback(
        async (id: string, isActive: boolean) => {
            return mutations.toggleActive({ id, isActive });
        },
        [mutations]
    );

    return {
        agents,
        defaultAgent,
        activeAgents,
        isLoading,
        error,
        onCreate: handleCreate,
        onUpdate: handleUpdate,
        onDelete: handleDelete,
        onSetDefault: handleSetDefault,
        onToggleActive: handleToggleActive,
        refetch,
        isCreating: mutations.isCreating,
        isUpdating: mutations.isUpdating,
        isDeleting: mutations.isDeleting,
    };
}
