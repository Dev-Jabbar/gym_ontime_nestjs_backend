# API reference

Base URL: `/api`. Authentication uses the session cookie set at login. Payments endpoints respond with `{ success, message, data }`.

**Access:** _Public_ = no login. _Auth_ = any logged-in user. Otherwise the role(s) allowed.

| Area                              | Method and path                                                                                          | Access                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Health**                        | `GET /health` (database and Redis status: `ok`, `degraded`, or `error` with HTTP 503)                    | Public                                   |
| **Auth** (mounted under `/users`) | `POST /users/register`, `POST /users/login` (rate limited: 10 per minute per IP)                         | Public                                   |
|                                   | `GET /users/me`                                                                                          | Auth                                     |
|                                   | `POST /users/logout`                                                                                     | Public                                   |
| **Users**                         | `GET /users`                                                                                             | admin                                    |
|                                   | `GET /users/:id`, `PUT /users/:id`                                                                       | admin or the user themselves             |
|                                   | `DELETE /users/:id` (soft delete)                                                                        | admin                                    |
|                                   | `POST /users/:id/upgrade-to-trainer`                                                                     | admin                                    |
| **Classes**                       | `GET /classes`, `GET /classes/:id`, `GET /classes/:id/member-count` (trainer phone hidden when anonymous) | Public                                   |
|                                   | `POST /classes`, `PUT /classes/:id`, `DELETE /classes/:id`                                               | admin                                    |
|                                   | `GET /classes/:id/members`                                                                               | trainer, admin                           |
|                                   | `GET /classes/by-member/:memberProfileId`                                                                | admin                                    |
|                                   | `POST` / `DELETE /classes/:id/members/:userId`                                                           | admin                                    |
|                                   | `PUT /classes/:id/trainer/:userId`                                                                       | admin                                    |
| **Members**                       | `POST /members/profile`, `GET` / `PUT` / `DELETE /members/me`                                            | member                                   |
|                                   | `GET /members`                                                                                           | admin                                    |
|                                   | `GET /members/:id`                                                                                       | admin, trainer, or the member themselves |
| **Trainers**                      | `POST /trainers/profile`, `GET` / `PUT` / `DELETE /trainers/me`                                          | trainer                                  |
|                                   | `GET /trainers/my-classes`                                                                               | trainer                                  |
|                                   | `GET /trainers`, `GET /trainers/:id` (date of birth visible to admin only)                               | Auth                                     |
| **Admin profile**                 | `GET /admins/me`, `PUT /admins/me`                                                                       | admin                                    |
| **Payments**                      | `POST /payments/initiate`, `GET /payments/verify`, `GET /payments/my-payments`                           | member                                   |
|                                   | `GET /payments`, `GET /payments/:id`, `GET /payments/class/:classId`                                     | admin                                    |
|                                   | `POST /payments/webhook`                                                                                 | Public (verified by HMAC signature)      |
| **Notifications**                 | `GET /notifications/my-notifications`, `PUT /notifications/:id/read`, `PUT /notifications/mark-all-read` | Auth                                     |
|                                   | `POST` / `DELETE /notifications/device-token` (register or remove a push device)                         | Auth                                     |
| **Uploads**                       | `POST /uploads/signature`                                                                                | Auth                                     |
| **Maintenance**                   | `POST /maintenance/run`, `/expire-subscriptions`, `/class-reminders` (queue that job now)                | admin                                    |

**Interactive documentation:** every route, its request body and the role it needs are listed in Swagger UI at `/api/docs` (live: https://gym-ontime-nest.onrender.com/api/docs; raw OpenAPI JSON at `/api/docs-json`). It is generated from the controllers and DTOs, so it stays in sync with the code. To try a protected route, call `POST /api/users/login` on that page first; the server sets the HTTP-only cookie and your browser sends it on the following requests. Set `SWAGGER_ENABLED=false` to switch the page off. The page does not describe the WebSocket events (see [Live seat counts](ARCHITECTURE.md#live-seat-counts-websocket)). A Postman collection is also used for manual testing.
