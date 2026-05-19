# Sao Manços — Sync Server

Liga a app de estatísticas ao Dashboard Excel após cada jogo.

## Instalação

```bash
pip install openpyxl
python sync_server.py
```

## Uso

### 1. Server automático (recomendado)
1. Abre `sync_server.py` com Python
2. O server fica activo em `http://localhost:5557`
3. Após o jogo, clica **📥 Excel** na app
4. Os dados fluem directo para o `Dashboard_Tactical_Lab.xlsx`

### 2. Importar CSV manualmente
```bash
python sync_server.py --import "C:\caminho\ficheiro.csv"
```

## Fluxo completo

```
Jogo ao vivo (app)
    ↓ regista ações
Exportar (📥 Excel)
    ↓ POST http://localhost:5557/sync
Sync Server (Python)
    ↓ write_to_excel()
Dashboard_Tactical_Lab.xlsx
    ↓ COUNTIF formulas
Dashboard atualiza!
```

## Se o server não estiver a correr

A app detecta automaticamente e faz fallback:.download de CSV → copy/paste manual para a sheet "Base de Dados".