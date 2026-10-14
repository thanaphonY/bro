package main

import (
	"fmt"
	"test/adanter"
	"test/repository"
	"test/service"

	"github.com/gofiber/fiber/v2"

	"strconv"
)

func main() {
	fmt.Println("hello world")

	app := fiber.New()

	viewRepo := repository.NewRepoView()
	viewService := service.NewViewService(viewRepo)
	viewAdanter := adanter.NewViewAdanter(viewService)

	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString("Hello, World!")
	})

	app.Get("/View1.js", viewAdanter.View)

	app.Get("/viewshtml", viewAdanter.ViewHtml)

	app.Get("/view", func(c *fiber.Ctx) error {
		portText := c.Query("port")

		fmt.Println(portText)

		if portText == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "กรุณาระบุ port เช่น /view?port=1202",
			})
		}

		port, err := strconv.Atoi(portText)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "port ต้องเป็นตัวเลข",
			})
		}
		switch port {
		case 1202:
			return c.JSON(fiber.Map{
				"port":   port,
				"device": "A",
				"data":   "ข้อมูลอุปกรณ์ A",
			})

		case 1203:
			return c.JSON(fiber.Map{
				"port":   port,
				"device": "B",
				"data":   "ข้อมูลอุปกรณ์ B",
			})

		case 1500:
			return c.JSON(fiber.Map{
				"port":   port,
				"device": "C",
				"data":   "ข้อมูลอุปกรณ์ C",
			})

		default:
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "ไม่พบอุปกรณ์สำหรับ port นี้",
			})
		}
	})

	app.Listen(":3000")
}
