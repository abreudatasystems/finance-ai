@echo off
echo Iniciando o Finance AI...

echo Iniciando o Backend...
start "Finance AI - Backend" cmd /k "cd backend && venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

echo Iniciando o Frontend...
start "Finance AI - Frontend" cmd /k "cd frontend && npm run dev"

echo O projeto esta a ser iniciado. 
echo O frontend devera abrir automaticamente ou estar disponivel em http://localhost:3000
echo O backend estara disponivel em http://localhost:8000
pause
