package resumeparse

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

const maxDocumentXML = 10 << 20

var errNotDOCX = fmt.Errorf("%w: not a valid .docx file", ErrUnreadable)

// DOCXText extracts paragraph text from a .docx file (word/document.xml), one paragraph per line.
func DOCXText(data []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", errNotDOCX
	}
	for _, f := range zr.File {
		if f.Name != "word/document.xml" {
			continue
		}
		if f.UncompressedSize64 > maxDocumentXML {
			return "", errNotDOCX
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		defer rc.Close()
		return documentText(io.LimitReader(rc, maxDocumentXML))
	}
	return "", errNotDOCX
}

func documentText(r io.Reader) (string, error) {
	dec := xml.NewDecoder(r)
	var b strings.Builder
	inText := false
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return strings.TrimSpace(b.String()), nil
		}
		if err != nil {
			return "", errNotDOCX
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "t":
				inText = true
			case "tab":
				b.WriteByte(' ')
			case "br":
				b.WriteByte('\n')
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				b.WriteByte('\n')
			}
		case xml.CharData:
			if inText {
				b.Write(t)
			}
		}
	}
}
