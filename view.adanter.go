package adanter

import (
	"test/service"

	"github.com/gofiber/fiber/v2"

	"fmt"
	"html/template"
	"reflect"
)

type viewService struct {
	repo service.ViewService
}

type Field struct {
	Name  string
	Value string
}

func NewViewAdanter(repo service.ViewService) *viewService {
	return &viewService{
		repo: repo,
	}
}

func (v *viewService) View(c *fiber.Ctx) error {
	view, err := v.repo.Views()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(view)
}

func (a *viewService) ViewHtml(c *fiber.Ctx) error {
	views, err := a.repo.Views()

	if len(views) == 0 {
		return c.Status(fiber.StatusNotFound).SendString("No view data")
	}

	v := reflect.ValueOf(views[0])
	t := reflect.TypeOf(views[0])

	fields := make([]Field, 0, v.NumField())

	for i := 0; i < v.NumField(); i++ {
		name := t.Field(i).Tag.Get("json")
		if name == "" {
			name = t.Field(i).Name
		}

		fields = append(fields, Field{
			Name:  name,
			Value: fmt.Sprintf("%v", v.Field(i).Interface()),
		})
	}

	tmpl, err := template.ParseFiles("templates/index.html")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).
			SendString("Cannot load HTML template")
	}

	c.Set("Content-Type", "text/html; charset=utf-8")

	if err := tmpl.Execute(c.Response().BodyWriter(), fields); err != nil {
		return c.Status(fiber.StatusInternalServerError).
			SendString("Cannot render HTML")
	}

	return nil
}
