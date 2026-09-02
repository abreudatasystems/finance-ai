import os

filepath = r'c:\Users\conex\Desktop\CEI\finance-ai\frontend\src\components\shared\CreateTransactionModal.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_mode = False

for i, line in enumerate(lines):
    if "import { Project } from '@/components/projects/types';" in line:
        continue
    if "import { fetchProjects } from '@/components/projects/api';" in line:
        continue
    if "const [projectId, setProjectId] = useState" in line:
        continue
    if "const [projects, setProjects] = useState" in line:
        continue
    if "fetchProjects(false).then((rows) => setProjects(rows || []));" in line:
        continue
    
    # Remove the useEffect block for projects
    if "useEffect(() => {" in line and i < len(lines) - 2 and "fetchProjects" in lines[i+1]:
        skip_mode = True
        continue
    if skip_mode and "fetchProjects" in line:
        continue
    if skip_mode and "}, []);" in line:
        skip_mode = False
        continue

    # Remove cost_center_id in handleSubmit
    if "cost_center_id: projectId || undefined," in line:
        continue
    if "cost_center_name: projects.find(" in line:
        continue

    # Remove the Project UI element inside the advanced options
    # We will just do a simple replacement for the UI part
    
    new_lines.append(line)

content = "".join(new_lines)

# Remove the Project dropdown from UI
ui_to_remove = """                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600">Projeto</label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-semibold"
                    >
                      <option value="">Sem projeto</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codigo} · {p.nome}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400">
                      Indicar o projeto é o que permite saber a margem de cada trabalho.
                    </p>
                  </div>"""

content = content.replace(ui_to_remove, "")
# And change grid-cols-2 to grid-cols-1 for that row
content = content.replace('<div className="grid grid-cols-2 gap-3">', '<div className="grid grid-cols-1 gap-3">')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed CreateTransactionModal.tsx")
