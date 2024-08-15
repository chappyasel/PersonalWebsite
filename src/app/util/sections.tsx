import About from "../components/About";
import Contact from "../components/Contact";
import Projects from "../components/Projects";
import Resume from "../components/Resume";

export interface Section {
  id: string;
  title: string;
  contents: JSX.Element;
}

export const SECTIONS: Section[] = [
  {
    id: "about",
    title: "About Me",
    contents: <About />,
  },
  {
    id: "projects",
    title: "Projects",
    contents: <Projects />,
  },
  {
    id: "resume",
    title: "Resume",
    contents: <Resume />,
  },
  {
    id: "contact",
    title: "Contact",
    contents: <Contact />,
  },
];
