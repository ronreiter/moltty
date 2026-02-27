package main

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/moltty/server/internal/auth"
	"github.com/moltty/server/internal/config"
	"github.com/moltty/server/internal/container"
	"github.com/moltty/server/internal/database"
	"github.com/moltty/server/internal/proxy"
	"github.com/moltty/server/internal/session"
	"github.com/moltty/server/internal/user"
	"github.com/moltty/server/internal/worker"
)

func main() {
	cfg := config.Load()

	// Database
	db := database.Connect(cfg.DatabaseURL)
	database.AutoMigrate(db,
		&user.User{},
		&session.Session{},
		&auth.RefreshToken{},
		&container.WorkerNode{},
		&worker.Worker{},
	)

	// Repositories
	userRepo := user.NewRepository(db)
	sessionRepo := session.NewRepository(db)
	workerPool := container.NewWorkerPool(db)
	workerRepo := worker.NewRepository(db)

	// Worker hub
	workerHub := worker.NewHub(workerRepo, sessionRepo, cfg.ScrollbackSize)
	workerHub.StartPingLoop(time.Duration(cfg.WorkerPingInterval) * time.Second)

	// Worker selector
	workerSelector := worker.NewHubSelector(workerRepo)

	// Services
	dockerMgr := container.NewDockerManager(cfg.SessionImage)
	sessionMgr := session.NewManager(sessionRepo, dockerMgr, workerPool)
	sessionMgr.SetWorkerSelector(workerSelector)

	// Handlers
	authHandler := auth.NewHandler(userRepo, db, cfg.JWTSecret)
	userHandler := user.NewHandler(userRepo)
	sessionHandler := session.NewHandler(sessionRepo, sessionMgr, workerHub)
	wsProxy := proxy.NewWSProxy(sessionRepo, cfg.JWTSecret, workerHub)
	workerHandler := worker.NewHandler(workerHub, workerRepo, cfg.JWTSecret)

	// Fiber app
	app := fiber.New(fiber.Config{
		BodyLimit: 1 * 1024 * 1024,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	// Public routes
	api := app.Group("/api")
	authGroup := api.Group("/auth")
	authGroup.Post("/register", authHandler.Register)
	authGroup.Post("/login", authHandler.Login)
	authGroup.Post("/refresh", authHandler.Refresh)

	// Google OAuth (only if configured)
	if cfg.GoogleClientID != "" {
		googleHandler := auth.NewGoogleHandler(
			cfg.GoogleClientID, cfg.GoogleSecret, cfg.GoogleRedirect,
			userRepo, db, cfg.JWTSecret,
		)
		authGroup.Get("/google", googleHandler.RedirectToGoogle)
		authGroup.Get("/google/callback", googleHandler.Callback)
		authGroup.Get("/google/complete", googleHandler.Complete)
	}

	// Worker WebSocket (registered before JWT header middleware)
	api.Use("/worker/ws", workerHandler.UpgradeMiddleware())
	api.Get("/worker/ws", workerHandler.WSHandler())

	// WebSocket terminal proxy (registered BEFORE protected group to avoid JWT header middleware)
	api.Use("/sessions/:id/terminal", wsProxy.UpgradeMiddleware())
	api.Get("/sessions/:id/terminal", wsProxy.Handler())

	// Protected routes
	protected := api.Group("", auth.JWTMiddleware(cfg.JWTSecret))
	protected.Get("/me", userHandler.GetMe)

	sessions := protected.Group("/sessions")
	sessions.Get("/", sessionHandler.List)
	sessions.Post("/", sessionHandler.Create)
	sessions.Patch("/:id", sessionHandler.Rename)
	sessions.Delete("/:id", sessionHandler.Delete)

	workers := protected.Group("/workers")
	workers.Get("/", workerHandler.List)
	workers.Delete("/:id", workerHandler.Delete)

	// Serve static web terminal viewer
	app.Static("/terminal", "./web")

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	log.Printf("Server starting on :%s", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
