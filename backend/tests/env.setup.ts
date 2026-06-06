// Runs before test files are imported — JWT secrets must exist before config/jwt loads.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'freshbazar_test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.CORS_CREDENTIALS = 'true';
