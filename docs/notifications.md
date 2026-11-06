# In-app notifications

Signed-in users can open the bell in the top navigation to see the latest leave workflow notifications. Unread notifications are highlighted, show a status-colored dot, and can be marked individually or all at once. Selecting a notification opens its leave request.

Notifications are created synchronously with workflow changes and are scoped to the recipient. The API is available at `GET /api/notifications`, `POST /api/notifications/:id/read`, and `POST /api/notifications/read-all`.

