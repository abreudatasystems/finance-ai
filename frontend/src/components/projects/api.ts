/** Data access for the projects module. */

import { apiGet, apiPostOrError, apiDeleteOrError } from '@/services/api';
import { Profitability, Project, ProjectStatement } from './types';

export async function fetchProjects(includeClosed = true): Promise<Project[] | null> {
  return apiGet<Project[]>(`/projects/?include_closed=${includeClosed}`);
}

export async function fetchProfitability(
  start?: string,
  end?: string,
): Promise<Profitability | null> {
  const query = [start && `start=${start}`, end && `end=${end}`].filter(Boolean).join('&');
  return apiGet<Profitability>(`/projects/profitability${query ? `?${query}` : ''}`);
}

export async function fetchStatement(id: string): Promise<ProjectStatement | null> {
  return apiGet<ProjectStatement>(`/projects/${id}/statement`);
}

export async function createProject(
  payload: Record<string, unknown>,
): Promise<{ data?: Project; error?: string }> {
  return apiPostOrError<Project>('/projects/', payload);
}

/** Deletes what nothing points at; closes what already has history. */
export async function removeProject(id: string) {
  return apiDeleteOrError<{ status: string; detalhe?: string }>(`/projects/${id}`);
}
