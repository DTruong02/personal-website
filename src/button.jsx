import styled from "styled-components";

export default function MyButton(props) {
    return (
      <A href="#"><i className={props.class}></i></A>
    );
  }
  const A = styled.a`
    height: 50px;
    width: 50px;
    display: inline-block;
    font-size: 50px;
    margin: 0 35px;
    padding: 50px;
    transition: all .6s ease;
    color: #262626;
    text-align: center;
    text-decoration: none;
    border-radius: 50%;`;

