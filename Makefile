commit:
	git add -A src/resources/$(name) src/resources/$(name).ts
	git commit -m "refactor($(name)): $(name).tsからフォルダに変更し、interfacesと処理を分離"
