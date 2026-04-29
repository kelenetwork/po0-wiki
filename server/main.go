package main

import (
	"context"
	"log"
	"net/http"

	"wiki-kele/server/internal/hub"
)

func main() {
	config := hub.ConfigFromEnv()
	store, err := hub.OpenStore(config.DBPath)
	if err != nil {
		log.Fatal(err)
	}
	defer store.Close()
	if err := store.Migrate(context.Background()); err != nil {
		log.Fatal(err)
	}
	if err := store.SeedDemo(context.Background()); err != nil {
		log.Fatal(err)
	}
	log.Printf("probe hub listening on %s", config.Addr)
	log.Fatal(http.ListenAndServe(config.Addr, hub.NewServer(store, config.AdminToken).Routes()))
}
