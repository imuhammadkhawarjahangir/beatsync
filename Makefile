.DEFAULT_GOAL := help

COMPOSE ?= docker compose

.PHONY: help config build up prod stop down restart logs ps volume

help:
	@echo Beatsync Docker targets:
	@echo   config   Render and validate the Compose configuration
	@echo   build    Build the client and server images
	@echo   up       Start the Compose stack
	@echo   prod     Build images and start the Compose stack
	@echo   stop     Stop the Compose services
	@echo   down     Remove containers and networks, preserving volumes
	@echo   restart  Restart the running Compose services
	@echo   logs     Follow client and server logs
	@echo   ps       Show Compose service status
	@echo   volume   Inspect the persistent local-storage volume

config:
	$(COMPOSE) config

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

prod:
	$(COMPOSE) build
	$(COMPOSE) up -d

stop:
	$(COMPOSE) stop

down:
	$(COMPOSE) down --remove-orphans

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f server client

ps:
	$(COMPOSE) ps

volume:
	docker volume inspect beatsync_server-data
