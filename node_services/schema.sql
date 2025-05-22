CREATE DATABASE chatfusedata;

\c chatfusedata;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT '0',
  rol VARCHAR(50) NOT NULL DEFAULT 'user',
  phone VARCHAR(50) UNIQUE
);

-- Modificar la tabla connections para incluir restricciones en status y qrPrivacy
CREATE TABLE connections (
  id SERIAL PRIMARY KEY,
  userid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'offline' CHECK (status IN ('connected', 'pause', 'offline')),
  webhook TEXT,
  qrprivacy VARCHAR(10) DEFAULT 'private' CHECK (qrprivacy IN ('public', 'private')),
  customtitle TEXT,
  customlogo TEXT,
  customdescription TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_connections_userid ON connections(userid);
