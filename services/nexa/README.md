# Nexa Access API

Внешний сервис для проверки и управления списком разрешённых Telegram ID.

## Запуск (разработка)

```bash
cd services/nexa
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn nexa_max_access:app --host 0.0.0.0 --port 8001
```

## Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/nexa/check?user_id=...` | Проверка доступа |
| POST | `/api/nexa/allowed` | Добавить ID в белый список |

Опционально: заголовок `x-api-key` (переменная окружения `NEXA_API_KEY`).

## systemd (Linux)

```bash
sudo cp nexa-max-access.service /etc/systemd/system/
# Разверните код в /opt/nexa-max-access и создайте nexa-max-access.env
sudo systemctl enable --now nexa-max-access
```
