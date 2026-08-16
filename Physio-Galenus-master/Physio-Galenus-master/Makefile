include .env
export

.PHONY: all install start db-schema-sync db-schema-drop db-migration-generate db-migration-create db-migration-run db-migration-revert serve-docs-frontend serve-docs-backend release clean-volumes

## Fresh start
all: clean-volumes start

## Install dependencies
install: clean-volumes 
	docker compose run --entrypoint="./scripts/install-dependencies.sh" nodejs --remove-orphans

## Start docker compose
start:
	@docker compose up --build --remove-orphans --force-recreate nodejs
	@docker compose rm -f -s -v postgres nodejs

## Sync the schema to the database.
db-schema-sync:
	@docker compose up -d --wait postgres
	@npm --prefix sources/backend/ run db:schema:sync
	@docker compose rm -f -s postgres

## Drop the schema from the database.
db-schema-drop:
	@docker compose up -d --wait postgres
	@npm --prefix sources/backend/ run db:schema:drop
	@docker compose rm -f -s postgres

## Generate a migration from differences between the entities and the current connected schema.
## Requires argument: ARGS="<name of the migration>"
db-migration-generate:
	@docker compose up --build --remove-orphans --no-recreate -d --wait postgres
	@npm --prefix sources/backend/ run db:migration:generate "$(ARGS)"  ; docker compose rm -f -s -v postgres
	@./sources/scripts/append-migration-index.js "$(ARGS)" sources/backend/src/database/migration

## Create an empty migration file with the given name.
## Requires argument: ARGS="<name of the migration>"
db-migration-create:
	@npm --prefix sources/backend/ run db:migration:create "$(ARGS)"
	@./sources/scripts/append-migration-index.js "$(ARGS)" sources/backend/src/database/migration

## Run all the migrations that have not been executed yet.
db-migration-run:
	@docker compose up --build --remove-orphans --no-recreate -d --wait postgres
	@npm --prefix sources/backend/ run db:migration:run ; docker compose rm -f -s -v postgres

## Revert the last executed migration.
db-migration-revert:
	@docker compose up --build --remove-orphans --no-recreate -d --wait postgres
	@npm --prefix sources/backend/ run db:migration:revert ; docker compose rm -f -s -v postgres

## Generate frontend documentation and serve on 8082
serve-docs-frontend:
	@npm --prefix sources/frontend/ run compodoc

## Generate backend documentation and serve on 8083
serve-docs-backend:
	@npm --prefix sources/backend/ run compodoc

## Compile all the generated changelog entries, write them to the root CHANGELOG.md file and update application version numbers
## Requires argument: VERSION="X.Y.Z"
release:
	@./sources/scripts/release.sh "$(VERSION)"

## Restore docker volumes and clean up database
clean-volumes:
	@docker compose down --volumes --rmi all
	@sudo rm -rf postgres-data/