'use client';

/**
 * Projetos — a casca; a rentabilidade vive em src/components/projects.
 */

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { ProjectsView } from '@/components/projects/ProjectsView';

export default function ProjectsPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Projetos', 'Quanto rendeu e quanto custou cada trabalho');
  }, [setPageHeader]);

  return <ProjectsView />;
}
